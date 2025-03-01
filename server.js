require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});

app.use(express.static('public'));

let users = [];
let stories = [];
let votes = {};
let adminId = null;
let timer = null;
let sessions = [];
let currentSessionId = null;

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const JIRA_STORY_POINTS_FIELD = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10026';

function extractTextFromADF(content) {
  if (!content || !Array.isArray(content)) return '';
  let text = '';
  content.forEach(node => {
    if (node.type === 'paragraph' || node.type === 'bulletList' || node.type === 'orderedList') {
      if (node.content) text += extractTextFromADF(node.content) + '\n';
    } else if (node.type === 'listItem') {
      if (node.content) text += '- ' + extractTextFromADF(node.content) + '\n';
    } else if (node.type === 'text') {
      text += node.text || '';
    } else if (node.content) {
      text += extractTextFromADF(node.content);
    }
  });
  return text.trim();
}

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.on('login', (name) => {
    console.log(`User login attempt: ${name}, Socket ID: ${socket.id}`);
    const existingUser = users.find(u => u.name === name);
    if (existingUser) {
      socket.emit('loginError', 'User with this name already exists. Please choose a different name.');
      return;
    }
    if (users.length === 0) {
      adminId = socket.id;
      console.log(`Set admin: ${socket.id}`);
      socket.emit('setAdmin', true, adminId);
    } else {
      socket.emit('setAdmin', false, adminId);
    }
    users.push({ id: socket.id, name, voted: false });
    console.log('Current users:', users);
    io.emit('updateUsers', users);
    
    console.log('Sending syncSessions to new user:', sessions);
    socket.emit('syncSessions', sessions);
    if (currentSessionId) {
      const currentSession = sessions.find(s => s.id === currentSessionId);
      if (currentSession) {
        console.log('Sending startSession to new user:', currentSession);
        socket.emit('startSession', currentSession);
      }
    }
  });

  socket.on('vote', (voteData) => {
    votes[socket.id] = voteData.vote;
    users = users.map(u => u.id === socket.id ? { ...u, voted: true } : u);
    io.emit('updateVotes', votes, users);
    io.emit('updateUsers', users);
  });

  socket.on('newStory', (story) => {
    if (socket.id === adminId && currentSessionId) {
      if (Object.keys(votes).length > 0) saveResults();
      stories.push(story);
      votes = {};
      users.forEach(u => u.voted = false);
      io.emit('updateUsers', users);
      io.emit('updateStory', story);
      io.emit('hideVotes');
    }
  });

  socket.on('submitFinalEstimate', async ({ estimate, jiraUrl }) => {
    if (socket.id === adminId && stories.length > 0) {
      const currentStory = stories[stories.length - 1];
      currentStory.finalEstimate = estimate;
      io.emit('updateStory', currentStory);

      if (jiraUrl) {
        try {
          const issueKey = jiraUrl.split('/').pop();
          const updateData = { fields: { [JIRA_STORY_POINTS_FIELD]: parseInt(estimate) } };
          console.log(`Attempting to update Jira issue ${issueKey} with:`, updateData);
          await axios.put(
            `${process.env.JIRA_API_URL}/rest/api/3/issue/${issueKey}`,
            updateData,
            {
              auth: { username: process.env.JIRA_USER_EMAIL, password: process.env.JIRA_API_TOKEN },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          console.log(`Updated Jira issue ${issueKey} with story points: ${estimate}`);
        } catch (error) {
          const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
          console.error('Jira update error:', errorMessage);
          socket.emit('jiraUpdateError', errorMessage);
        }
      }
      saveResults();
    }
  });

  socket.on('saveSession', (sessionData) => {
    if (socket.id === adminId) {
      const sessionId = uuidv4();
      const newSession = { ...sessionData, id: sessionId, results: [] };
      sessions.push(newSession);
      console.log('Saved session:', newSession);
      io.emit('syncSessions', sessions);
    }
  });

  socket.on('startSession', (sessionData) => {
    if (socket.id === adminId) {
      const sessionId = sessionData.id || uuidv4();
      const existingIndex = sessions.findIndex(s => s.id === sessionId);
      const newSession = existingIndex !== -1 ? sessions[existingIndex] : { ...sessionData, id: sessionId, results: [] };
      if (existingIndex === -1) sessions.push(newSession);
      currentSessionId = sessionId;
      console.log('Starting session:', newSession);
      io.emit('startSession', newSession);
      console.log('Broadcasting syncSessions:', sessions);
      io.emit('syncSessions', sessions);
      stories = [];
      votes = {};
      users.forEach(u => u.voted = false);
      io.emit('updateUsers', users);
    }
  });

  socket.on('startTimer', (seconds) => {
    if (socket.id === adminId) {
      clearInterval(timer);
      let timeLeft = seconds;
      io.emit('timerUpdate', timeLeft);
      timer = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
          clearInterval(timer);
          io.emit('showVotes', votes, users);
          saveResults();
        }
      }, 1000);
    }
  });

  socket.on('endVoting', () => {
    if (socket.id === adminId) {
      clearInterval(timer);
      io.emit('timerUpdate', 0);
      io.emit('showVotes', votes, users);
      saveResults();
    }
  });

  socket.on('endSession', () => {
    if (socket.id === adminId) {
      clearInterval(timer);
      io.emit('timerUpdate', 0);
      if (Object.keys(votes).length > 0) saveResults();
      const currentSession = sessions.find(s => s.id === currentSessionId);
      console.log('Sending sessionSummary:', currentSession.results);
      io.emit('sessionSummary', currentSession.results);
      sendToSlack(currentSession.results, currentSession);
      currentSessionId = null;
      stories = [];
      votes = {};
      io.emit('syncSessions', sessions);
    }
  });

  socket.on('closeServer', () => {
    if (socket.id === adminId) {
      console.log('Closing server, notifying all clients');
      io.emit('serverClosed');
      setTimeout(() => {
        io.disconnectSockets();
        server.close();
      }, 2000);
    }
  });

  socket.on('jiraImport', async (jiraUrl) => {
    if (socket.id === adminId) {
      try {
        const issueKey = jiraUrl.split('/').pop();
        const response = await axios.get(`${process.env.JIRA_API_URL}/rest/api/3/issue/${issueKey}`, {
          auth: { username: process.env.JIRA_USER_EMAIL, password: process.env.JIRA_API_TOKEN },
          headers: { 'Accept': 'application/json' }
        });
        const issue = response.data;
        const description = issue.fields.description ? extractTextFromADF(issue.fields.description.content) : '';
        socket.emit('jiraImportResult', { summary: issue.fields.summary, description, jiraUrl });
      } catch (error) {
        console.error('Jira import error:', error.response ? error.response.data : error.message);
        socket.emit('jiraImportResult', { error: error.response ? error.response.data.errorMessages.join(', ') : error.message });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    users = users.filter(u => u.id !== socket.id);
    delete votes[socket.id];
    if (socket.id === adminId) {
      adminId = users.length > 0 ? users[0].id : null;
      if (adminId) io.to(adminId).emit('setAdmin', true, adminId);
    }
    io.emit('updateUsers', users);
  });
});

function saveResults() {
  const currentStory = stories[stories.length - 1] || { summary: 'No story', description: '', finalEstimate: null };
  const result = {
    story: currentStory,
    votes: Object.keys(votes).map(id => ({
      user: users.find(u => u.id === id)?.name || 'Unknown',
      vote: votes[id]
    }))
  };
  if (currentSessionId) {
    const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].results.push(result);
      console.log('Saved results for session:', sessions[sessionIndex]);
      io.emit('syncSessions', sessions);
    }
  }

  fs.readFile('results.json', (err, data) => {
    let results = [];
    if (!err && data) results = JSON.parse(data);
    results.push({ timestamp: new Date().toISOString(), sessionId: currentSessionId, ...result });
    fs.writeFile('results.json', JSON.stringify(results, null, 2), (err) => {
      if (err) console.error('Error saving results:', err);
    });
  });
}

async function sendToSlack(sessionResults, currentSession) {
  if (!sessionResults || sessionResults.length === 0) {
    console.log('No session results to send to Slack');
    return;
  }

  const sessionHeader = currentSession
    ? `*Session: ${currentSession.sessionName}*\n*Sprint: ${currentSession.sprint}*\n*Sprint Goal: ${currentSession.sprintGoal}*\n`
    : '*Session Summary*\n';

  const storyMap = {};
  sessionResults.forEach(s => {
    const key = `${s.story.summary} - ${s.story.description}`;
    if (!storyMap[key]) storyMap[key] = { votes: {}, finalEstimate: s.story.finalEstimate };
    s.votes.forEach(v => storyMap[key].votes[v.user] = v.vote);
  });

  const summaryText = Object.keys(storyMap).map(storyKey => {
    const [summary, description] = storyKey.split(' - ');
    const votesList = Object.keys(storyMap[storyKey].votes)
      .map(user => `${user} voted ${storyMap[storyKey].votes[user]}`)
      .join(', ');
    const finalEstimateText = storyMap[storyKey].finalEstimate ? `\nFinal Estimate: ${storyMap[storyKey].finalEstimate}` : '';
    return `Summary: "${summary}"\nDescription: "${description}"\nVotes: ${votesList}${finalEstimateText}`;
  }).join('\n\n');

  const slackMessage = { text: `${sessionHeader}${summaryText}` };

  try {
    const response = await axios.post(SLACK_WEBHOOK_URL, slackMessage);
    console.log('Slack message sent:', response.data);
  } catch (error) {
    console.error('Error sending to Slack:', error.response ? error.response.data : error.message);
  }
}

server.listen(3001, () => console.log('Server running on http://localhost:3001'));
