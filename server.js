require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

app.use(express.static("public"));

// Initialize SQLite database
const db = new sqlite3.Database("./sessions.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(
      `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      sessionName TEXT,
      sprint TEXT,
      sprintGoal TEXT,
      date TEXT,
      results TEXT
    )`,
      (err) => {
        if (err) console.error("Error creating table:", err.message);
      }
    );
  }
});

let users = [];
let stories = [];
let votes = {};
let adminId = null;
let timer = null;
let pendingSessions = [];
let currentSessionId = null;

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const JIRA_STORY_POINTS_FIELD =
  process.env.JIRA_STORY_POINTS_FIELD || "customfield_10026";

function extractTextFromADF(content) {
  if (!content || !Array.isArray(content)) return "";
  let text = "";
  content.forEach((node) => {
    if (
      node.type === "paragraph" ||
      node.type === "bulletList" ||
      node.type === "orderedList"
    ) {
      if (node.content) text += extractTextFromADF(node.content) + "\n";
    } else if (node.type === "listItem") {
      if (node.content) text += "- " + extractTextFromADF(node.content) + "\n";
    } else if (node.type === "text") {
      text += node.text || "";
    } else if (node.content) {
      text += extractTextFromADF(node.content);
    }
  });
  return text.trim();
}

// Helper function to get all sessions from DB
function getSessions(callback) {
  db.all("SELECT * FROM sessions", (err, rows) => {
    if (err) {
      console.error("Error fetching sessions:", err.message);
      callback([]);
    } else {
      const sessions = rows.map((row) => ({
        id: row.id,
        sessionName: row.sessionName,
        sprint: row.sprint,
        sprintGoal: row.sprintGoal,
        date: row.date,
        results: JSON.parse(row.results || "[]"),
      }));
      callback(sessions);
    }
  });
}

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.on("login", (name) => {
    console.log(`User login attempt: ${name}, Socket ID: ${socket.id}`);
    const existingUser = users.find((u) => u.name === name);
    if (existingUser) {
      socket.emit(
        "loginError",
        "User with this name already exists. Please choose a different name."
      );
      return;
    }

    const isAdmin = name.toLowerCase() === "admin";
    if (isAdmin) {
      adminId = socket.id;
      console.log(`Set admin: ${socket.id} for user "admin"`);
      socket.emit("setAdmin", true, adminId);
    } else {
      socket.emit("setAdmin", false, adminId);
    }

    users.push({ id: socket.id, name, voted: false });
    console.log("Current users:", users);
    io.emit("updateUsers", users);

    getSessions((sessions) => {
      console.log("Sending syncSessions to new user:", sessions);
      socket.emit("syncSessions", sessions);
      socket.emit("syncPendingSessions", pendingSessions);
      if (currentSessionId) {
        db.get(
          "SELECT * FROM sessions WHERE id = ?",
          [currentSessionId],
          (err, row) => {
            if (err) {
              console.error("Error fetching current session:", err.message);
            } else if (row) {
              const currentSession = {
                id: row.id,
                sessionName: row.sessionName,
                sprint: row.sprint,
                sprintGoal: row.sprintGoal,
                date: row.date,
                results: JSON.parse(row.results || "[]"),
              };
              console.log("Sending startSession to new user:", currentSession);
              socket.emit("startSession", currentSession);
            }
          }
        );
      }
    });
  });

  socket.on("vote", (voteData) => {
    votes[socket.id] = voteData.vote;
    users = users.map((u) => (u.id === socket.id ? { ...u, voted: true } : u));
    io.emit("updateVotes", votes, users);
    io.emit("updateUsers", users);
  });

  socket.on("newStory", (story) => {
    if (socket.id === adminId && currentSessionId) {
      if (Object.keys(votes).length > 0) saveResults();
      stories.push(story);
      votes = {};
      users.forEach((u) => (u.voted = false));
      io.emit("updateUsers", users);
      io.emit("updateStory", story);
      io.emit("hideVotes");
      io.emit("resetVoting");
    }
  });

  socket.on("submitFinalEstimate", async ({ estimate, jiraUrl }) => {
    if (socket.id === adminId && stories.length > 0) {
      const currentStory = stories[stories.length - 1];
      currentStory.finalEstimate = estimate;
      io.emit("updateStory", currentStory);

      if (jiraUrl) {
        try {
          const issueKey = jiraUrl.split("/").pop();
          const updateData = {
            fields: { [JIRA_STORY_POINTS_FIELD]: parseInt(estimate) },
          };
          console.log(
            `Attempting to update Jira issue ${issueKey} with:`,
            updateData
          );
          await axios.put(
            `${process.env.JIRA_API_URL}/rest/api/3/issue/${issueKey}`,
            updateData,
            {
              auth: {
                username: process.env.JIRA_USER_EMAIL,
                password: process.env.JIRA_API_TOKEN,
              },
              headers: { "Content-Type": "application/json" },
            }
          );
          console.log(
            `Updated Jira issue ${issueKey} with story points: ${estimate}`
          );
        } catch (error) {
          const errorMessage = error.response
            ? JSON.stringify(error.response.data)
            : error.message;
          console.error("Jira update error:", errorMessage);
          socket.emit("jiraUpdateError", errorMessage);
        }
      }
      saveResults();
      io.emit("finalEstimateSubmitted");
    }
  });

  socket.on("proposeSession", (sessionData) => {
    const sessionId = uuidv4();
    const newSession = {
      ...sessionData,
      id: sessionId,
      pending: true,
      proposedBy: users.find((u) => u.id === socket.id)?.name || "Unknown",
    };
    pendingSessions.push(newSession);
    console.log("Proposed session:", newSession);
    io.emit("syncPendingSessions", pendingSessions);
  });

  socket.on("approveSession", (sessionId) => {
    if (socket.id === adminId) {
      const sessionIndex = pendingSessions.findIndex((s) => s.id === sessionId);
      if (sessionIndex !== -1) {
        const approvedSession = {
          ...pendingSessions[sessionIndex],
          pending: false,
        };
        delete approvedSession.proposedBy;
        db.run(
          "INSERT INTO sessions (id, sessionName, sprint, sprintGoal, date, results) VALUES (?, ?, ?, ?, ?, ?)",
          [
            approvedSession.id,
            approvedSession.sessionName,
            approvedSession.sprint,
            approvedSession.sprintGoal,
            approvedSession.date,
            JSON.stringify([]),
          ],
          (err) => {
            if (err)
              console.error("Error inserting approved session:", err.message);
            else {
              console.log("Approved session:", approvedSession);
              getSessions((sessions) => io.emit("syncSessions", sessions));
              pendingSessions.splice(sessionIndex, 1);
              io.emit("syncPendingSessions", pendingSessions);
            }
          }
        );
      }
    }
  });

  socket.on("saveSession", (sessionData) => {
    if (socket.id === adminId) {
      const sessionId = uuidv4();
      const newSession = { ...sessionData, id: sessionId, results: [] };
      db.run(
        "INSERT INTO sessions (id, sessionName, sprint, sprintGoal, date, results) VALUES (?, ?, ?, ?, ?, ?)",
        [
          sessionId,
          newSession.sessionName,
          newSession.sprint,
          newSession.sprintGoal,
          newSession.date,
          JSON.stringify(newSession.results),
        ],
        (err) => {
          if (err) console.error("Error saving session:", err.message);
          else {
            console.log("Saved session:", newSession);
            getSessions((sessions) => io.emit("syncSessions", sessions));
          }
        }
      );
    }
  });

  socket.on("updateSession", (sessionData) => {
    if (socket.id === adminId) {
      db.run(
        "UPDATE sessions SET sessionName = ?, sprint = ?, sprintGoal = ?, date = ? WHERE id = ?",
        [
          sessionData.sessionName,
          sessionData.sprint,
          sessionData.sprintGoal,
          sessionData.date,
          sessionData.id,
        ],
        (err) => {
          if (err) console.error("Error updating session:", err.message);
          else {
            console.log("Updated session:", sessionData);
            getSessions((sessions) => io.emit("syncSessions", sessions));
          }
        }
      );
    }
  });

  socket.on("startSession", (sessionData) => {
    if (socket.id === adminId) {
      const sessionId = sessionData.id || uuidv4();
      db.get("SELECT * FROM sessions WHERE id = ?", [sessionId], (err, row) => {
        if (err) {
          console.error("Error checking session:", err.message);
          return;
        }
        const newSession = row
          ? {
              id: row.id,
              sessionName: row.sessionName,
              sprint: row.sprint,
              sprintGoal: row.sprintGoal,
              date: row.date,
              results: JSON.parse(row.results || "[]"),
            }
          : { ...sessionData, id: sessionId, results: [] };

        if (!row) {
          db.run(
            "INSERT INTO sessions (id, sessionName, sprint, sprintGoal, date, results) VALUES (?, ?, ?, ?, ?, ?)",
            [
              sessionId,
              newSession.sessionName,
              newSession.sprint,
              newSession.sprintGoal,
              newSession.date,
              JSON.stringify(newSession.results),
            ],
            (err) => {
              if (err)
                console.error("Error inserting new session:", err.message);
            }
          );
        }

        currentSessionId = sessionId;
        console.log("Starting session:", newSession);
        io.emit("startSession", newSession);
        getSessions((sessions) => {
          console.log("Broadcasting syncSessions:", sessions);
          io.emit("syncSessions", sessions);
        });
        stories = [];
        votes = {};
        users.forEach((u) => (u.voted = false));
        io.emit("updateUsers", users);
      });
    }
  });

  socket.on("restartSession", (sessionId) => {
    if (socket.id === adminId) {
      db.get("SELECT * FROM sessions WHERE id = ?", [sessionId], (err, row) => {
        if (err || !row) {
          console.log("Session not found for restart:", sessionId);
          return;
        }
        db.run(
          "UPDATE sessions SET results = ? WHERE id = ?",
          [JSON.stringify([]), sessionId],
          (err) => {
            if (err)
              console.error("Error resetting session results:", err.message);
            const session = {
              id: row.id,
              sessionName: row.sessionName,
              sprint: row.sprint,
              sprintGoal: row.sprintGoal,
              date: row.date,
              results: [],
            };
            currentSessionId = sessionId;
            stories = [];
            votes = {};
            users.forEach((u) => (u.voted = false));
            console.log("Restarting session:", session);
            io.emit("startSession", session);
            io.emit("updateUsers", users);
            io.emit("resetVoting");
            io.emit("hideVotes");
          }
        );
      });
    }
  });

  socket.on("deleteSession", (sessionId) => {
    if (socket.id === adminId) {
      db.run("DELETE FROM sessions WHERE id = ?", [sessionId], (err) => {
        if (err) console.error("Error deleting session:", err.message);
        else {
          if (sessionId === currentSessionId) {
            currentSessionId = null;
            stories = [];
            votes = {};
            io.emit("updateUsers", users);
          }
          console.log("Deleted session:", sessionId);
          getSessions((sessions) => io.emit("syncSessions", sessions));
        }
      });
    }
  });

  socket.on("startTimer", (seconds) => {
    if (socket.id === adminId) {
      clearInterval(timer);
      let timeLeft = seconds;
      io.emit("startTimerSync", seconds);
      io.emit("timerUpdate", timeLeft);
      timer = setInterval(() => {
        timeLeft--;
        io.emit("timerUpdate", timeLeft);
        if (timeLeft <= 0) {
          clearInterval(timer);
          io.emit("showVotes", votes, users);
          saveResults();
        }
      }, 1000);
    }
  });

  socket.on("endVoting", () => {
    if (socket.id === adminId) {
      clearInterval(timer);
      io.emit("timerUpdate", 0);
      io.emit("showVotes", votes, users);
      saveResults();
    }
  });

  socket.on("endSession", () => {
    if (socket.id === adminId) {
      clearInterval(timer);
      io.emit("timerUpdate", 0);
      if (Object.keys(votes).length > 0) saveResults();
      db.get(
        "SELECT * FROM sessions WHERE id = ?",
        [currentSessionId],
        (err, row) => {
          if (err || !row) {
            console.error("Error fetching session for summary:", err?.message);
            return;
          }
          const currentSession = {
            id: row.id,
            sessionName: row.sessionName,
            sprint: row.sprint,
            sprintGoal: row.sprintGoal,
            date: row.date,
            results: JSON.parse(row.results || "[]"),
          };
          console.log("Sending sessionSummary:", currentSession.results);
          io.emit("sessionSummary", currentSession.results);
          sendToSlack(currentSession.results, currentSession);
          currentSessionId = null;
          stories = [];
          votes = {};
          getSessions((sessions) => io.emit("syncSessions", sessions));
        }
      );
    }
  });

  socket.on("closeServer", () => {
    if (socket.id === adminId) {
      console.log("Closing server, notifying all clients");
      io.emit("serverClosed");
      setTimeout(() => {
        io.disconnectSockets();
        server.close();
        db.close((err) => {
          if (err) console.error("Error closing database:", err.message);
          else console.log("Database closed.");
        });
      }, 2000);
    }
  });

  socket.on("jiraImport", async (jiraUrl) => {
    if (socket.id === adminId) {
      try {
        const issueKey = jiraUrl.split("/").pop();
        const response = await axios.get(
          `${process.env.JIRA_API_URL}/rest/api/3/issue/${issueKey}`,
          {
            auth: {
              username: process.env.JIRA_USER_EMAIL,
              password: process.env.JIRA_API_TOKEN,
            },
            headers: { Accept: "application/json" },
          }
        );
        const issue = response.data;
        const description = issue.fields.description
          ? extractTextFromADF(issue.fields.description.content)
          : "";
        socket.emit("jiraImportResult", {
          summary: issue.fields.summary,
          description,
          jiraUrl,
        });
      } catch (error) {
        console.error(
          "Jira import error:",
          error.response ? error.response.data : error.message
        );
        socket.emit("jiraImportResult", {
          error: error.response
            ? error.response.data.errorMessages.join(", ")
            : error.message,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    users = users.filter((u) => u.id !== socket.id);
    delete votes[socket.id];
    if (socket.id === adminId) {
      adminId = null;
      console.log("Admin disconnected, adminId cleared");
    }
    io.emit("updateUsers", users);
  });
});

function saveResults() {
  const currentStory = stories[stories.length - 1] || {
    summary: "No story",
    description: "",
    finalEstimate: null,
  };
  const result = {
    story: currentStory,
    votes: Object.keys(votes).map((id) => ({
      user: users.find((u) => u.id === id)?.name || "Unknown",
      vote: votes[id],
    })),
  };
  if (currentSessionId) {
    db.get(
      "SELECT results FROM sessions WHERE id = ?",
      [currentSessionId],
      (err, row) => {
        if (err) {
          console.error("Error fetching session results:", err.message);
          return;
        }
        const results = row ? JSON.parse(row.results || "[]") : [];
        results.push(result);
        db.run(
          "UPDATE sessions SET results = ? WHERE id = ?",
          [JSON.stringify(results), currentSessionId],
          (err) => {
            if (err)
              console.error("Error saving results to session:", err.message);
            else {
              console.log("Saved results for session:", currentSessionId);
              getSessions((sessions) => io.emit("syncSessions", sessions));
            }
          }
        );
      }
    );
  }

  fs.readFile("results.json", (err, data) => {
    let results = [];
    if (!err && data) results = JSON.parse(data);
    results.push({
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId,
      ...result,
    });
    fs.writeFile("results.json", JSON.stringify(results, null, 2), (err) => {
      if (err) console.error("Error saving results:", err);
    });
  });
}

async function sendToSlack(sessionResults, currentSession) {
  if (!sessionResults || sessionResults.length === 0) {
    console.log("No session results to send to Slack");
    return;
  }

  const sessionHeader = currentSession
    ? `*Session: ${currentSession.sessionName}*\n*Sprint: ${currentSession.sprint}*\n*Sprint Goal: ${currentSession.sprintGoal}*\n`
    : "*Session Summary*\n";

  const storyMap = {};
  sessionResults.forEach((s) => {
    const key = `${s.story.summary} - ${s.story.description}`;
    if (!storyMap[key])
      storyMap[key] = { votes: {}, finalEstimate: s.story.finalEstimate };
    s.votes.forEach((v) => (storyMap[key].votes[v.user] = v.vote));
  });

  const summaryText = Object.keys(storyMap)
    .map((storyKey) => {
      const [summary, description] = storyKey.split(" - ");
      const votesList = Object.keys(storyMap[storyKey].votes)
        .map((user) => `${user} voted ${storyMap[storyKey].votes[user]}`)
        .join(", ");
      const finalEstimateText = storyMap[storyKey].finalEstimate
        ? `\nFinal Estimate: ${storyMap[storyKey].finalEstimate}`
        : "";
      return `Summary: "${summary}"\nDescription: "${description}"\nVotes: ${votesList}${finalEstimateText}`;
    })
    .join("\n\n");

  const slackMessage = { text: `${sessionHeader}${summaryText}` };

  try {
    const response = await axios.post(SLACK_WEBHOOK_URL, slackMessage);
    console.log("Slack message sent:", response.data);
  } catch (error) {
    console.error(
      "Error sending to Slack:",
      error.response ? error.response.data : error.message
    );
  }
}

server.listen(3001, () =>
  console.log("Server running on http://localhost:3001")
);
