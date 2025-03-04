// /react-planning-poker-2.0/server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
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

const db = new sqlite3.Database("./sessions.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      sessionName TEXT,
      sprint TEXT,
      sprintGoal TEXT,
      date TEXT,
      results TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT,
      timestamp TEXT,
      storySummary TEXT,
      storyDescription TEXT,
      finalEstimate TEXT,
      votes TEXT,
      FOREIGN KEY (sessionId) REFERENCES sessions(id)
    )`);
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      role TEXT DEFAULT 'User'
    )`,
      (err) => {
        if (err) console.error("Error creating users table:", err.message);
        // Seed admin if not exists
        db.run(
          "INSERT OR IGNORE INTO users (id, name, role) VALUES (?, ?, ?)",
          [uuidv4(), "admin", "Admin"]
        );
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

function getSessions(callback) {
  db.all("SELECT * FROM sessions", (err, rows) => {
    if (err) {
      console.error("Error fetching sessions:", err.message);
      callback([]);
      return;
    }
    const sessions = [];
    let pending = rows.length;
    if (pending === 0) return callback([]);

    rows.forEach((row) => {
      getSessionResults(row.id, (results) => {
        sessions.push({
          id: row.id,
          sessionName: row.sessionName,
          sprint: row.sprint,
          sprintGoal: row.sprintGoal,
          date: row.date,
          results: results,
        });
        if (--pending === 0) callback(sessions);
      });
    });
  });
}

function getSessionResults(sessionId, callback) {
  db.all(
    "SELECT * FROM results WHERE sessionId = ?",
    [sessionId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching results:", err.message);
        callback([]);
      } else {
        const results = rows.map((row) => ({
          story: {
            summary: row.storySummary,
            description: row.storyDescription,
            finalEstimate: row.finalEstimate,
          },
          votes: JSON.parse(row.votes || "[]"),
        }));
        callback(results);
      }
    }
  );
}

function getUsers(callback) {
  db.all("SELECT * FROM users", (err, rows) => {
    if (err) {
      console.error("Error fetching users:", err.message);
      callback([]);
    } else {
      callback(rows);
    }
  });
}

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.on("login", (name) => {
    console.log(`User login attempt: ${name}, Socket ID: ${socket.id}`);
    db.get("SELECT * FROM users WHERE name = ?", [name], (err, row) => {
      if (err) {
        console.error("Error checking user:", err.message);
        socket.emit("loginError", "Database error");
        return;
      }
      if (row) {
        if (users.find((u) => u.name === name)) {
          socket.emit("loginError", "User with this name already exists.");
          return;
        }
        users.push({ id: socket.id, name, voted: false, role: row.role });
        const isAdmin = row.role === "Admin";
        if (isAdmin) adminId = socket.id;
        socket.emit("setAdmin", isAdmin, adminId);
      } else {
        const userId = uuidv4();
        db.run(
          "INSERT INTO users (id, name, role) VALUES (?, ?, ?)",
          [userId, name, "User"],
          (err) => {
            if (err) {
              console.error("Error inserting user:", err.message);
              socket.emit("loginError", "Database error");
              return;
            }
            users.push({ id: socket.id, name, voted: false, role: "User" });
            socket.emit("setAdmin", false, adminId);
          }
        );
      }
      io.emit(
        "updateUsers",
        users.map((u) => ({
          id: u.id,
          name: u.name,
          voted: u.voted,
          role: u.role,
        }))
      );
      getSessions((sessions) => {
        socket.emit("syncSessions", sessions);
        socket.emit("syncPendingSessions", pendingSessions);
        if (currentSessionId) {
          db.get(
            "SELECT * FROM sessions WHERE id = ?",
            [currentSessionId],
            (err, row) => {
              if (row) {
                getSessionResults(currentSessionId, (results) => {
                  socket.emit("startSession", { ...row, results });
                });
              }
            }
          );
        }
      });
    });
  });

  socket.on("setUserRole", ({ userId, role }) => {
    if (socket.id === adminId) {
      db.run(
        "UPDATE users SET role = ? WHERE id = ?",
        [role, userId],
        (err) => {
          if (err) {
            console.error("Error updating user role:", err.message);
          } else {
            console.log(`Set role for user ${userId} to ${role}`);
            const userIndex = users.findIndex((u) => u.id === userId);
            if (userIndex !== -1) {
              users[userIndex].role = role;
              if (role === "Admin" && !adminId) adminId = userId;
              else if (role !== "Admin" && adminId === userId) adminId = null;
              io.emit(
                "updateUsers",
                users.map((u) => ({
                  id: u.id,
                  name: u.name,
                  voted: u.voted,
                  role: u.role,
                }))
              );
              // Notify the affected user with setAdmin
              const affectedUserSocket = io.sockets.sockets.get(userId);
              if (affectedUserSocket) {
                affectedUserSocket.emit("setAdmin", role === "Admin", adminId);
              }
            }
          }
        }
      );
    }
  });

  socket.on("vote", (voteData) => {
    votes[socket.id] = voteData.vote;
    users = users.map((u) => (u.id === socket.id ? { ...u, voted: true } : u));
    io.emit("updateVotes", votes, users);
    io.emit(
      "updateUsers",
      users.map((u) => ({
        id: u.id,
        name: u.name,
        voted: u.voted,
        role: u.role,
      }))
    );
  });

  socket.on("newStory", (story) => {
    if (socket.id === adminId && currentSessionId) {
      if (Object.keys(votes).length > 0) saveResults();
      stories.push(story);
      votes = {};
      users.forEach((u) => (u.voted = false));
      io.emit(
        "updateUsers",
        users.map((u) => ({
          id: u.id,
          name: u.name,
          voted: u.voted,
          role: u.role,
        }))
      );
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

      db.get(
        "SELECT id FROM results WHERE sessionId = ? AND storySummary = ? AND storyDescription = ? ORDER BY timestamp DESC LIMIT 1",
        [currentSessionId, currentStory.summary, currentStory.description],
        (err, row) => {
          if (err)
            console.error("Error checking existing result:", err.message);
          else if (row) {
            db.run(
              "UPDATE results SET finalEstimate = ?, votes = ? WHERE id = ?",
              [
                estimate,
                JSON.stringify(
                  Object.keys(votes).map((id) => ({
                    user: users.find((u) => u.id === id)?.name || "Unknown",
                    vote: votes[id],
                  }))
                ),
                row.id,
              ],
              (err) => {
                if (err) console.error("Error updating result:", err.message);
                else
                  getSessions((sessions) => io.emit("syncSessions", sessions));
              }
            );
          } else {
            saveResults();
          }
          // Emit the estimate value with the event
          io.emit("finalEstimateSubmitted", { estimate });
        }
      );
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
          else getSessions((sessions) => io.emit("syncSessions", sessions));
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
          else getSessions((sessions) => io.emit("syncSessions", sessions));
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
        io.emit("startSession", newSession);
        getSessions((sessions) => io.emit("syncSessions", sessions));
        stories = [];
        votes = {};
        users.forEach((u) => (u.voted = false));
        io.emit(
          "updateUsers",
          users.map((u) => ({
            id: u.id,
            name: u.name,
            voted: u.voted,
            role: u.role,
          }))
        );
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
          "DELETE FROM results WHERE sessionId = ?",
          [sessionId],
          (err) => {
            if (err)
              console.error("Error clearing session results:", err.message);
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
            io.emit("startSession", session);
            io.emit(
              "updateUsers",
              users.map((u) => ({
                id: u.id,
                name: u.name,
                voted: u.voted,
                role: u.role,
              }))
            );
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
          db.run(
            "DELETE FROM results WHERE sessionId = ?",
            [sessionId],
            (err) => {
              if (err)
                console.error("Error deleting session results:", err.message);
              if (sessionId === currentSessionId) {
                currentSessionId = null;
                stories = [];
                votes = {};
                io.emit(
                  "updateUsers",
                  users.map((u) => ({
                    id: u.id,
                    name: u.name,
                    voted: u.voted,
                    role: u.role,
                  }))
                );
              }
              getSessions((sessions) => io.emit("syncSessions", sessions));
            }
          );
        }
      });
    }
  });

  socket.on("startTimer", (seconds) => {
    if (socket.id === adminId) {
      clearInterval(timer);
      let timeLeft = seconds;
      io.emit("startTimerSync", seconds); // Emit initial duration to all clients
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
          getSessionResults(currentSessionId, (results) => {
            const currentSession = {
              id: row.id,
              sessionName: row.sessionName,
              sprint: row.sprint,
              sprintGoal: row.sprintGoal,
              date: row.date,
              results: results,
            };
            io.emit("sessionSummary", currentSession.results);
            sendToSlack(currentSession.results, currentSession);
            currentSessionId = null;
            stories = [];
            votes = {};
            getSessions((sessions) => io.emit("syncSessions", sessions));
          });
        }
      );
    }
  });

  socket.on("closeServer", () => {
    if (socket.id === adminId) {
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
    if (socket.id === adminId) adminId = null;
    io.emit(
      "updateUsers",
      users.map((u) => ({
        id: u.id,
        name: u.name,
        voted: u.voted,
        role: u.role,
      }))
    );
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
      "SELECT id FROM results WHERE sessionId = ? AND storySummary = ? AND storyDescription = ? ORDER BY timestamp DESC LIMIT 1",
      [currentSessionId, currentStory.summary, currentStory.description],
      (err, row) => {
        if (err) console.error("Error checking existing result:", err.message);
        else if (row) {
          db.run(
            "UPDATE results SET finalEstimate = ?, votes = ?, timestamp = ? WHERE id = ?",
            [
              currentStory.finalEstimate || null,
              JSON.stringify(result.votes),
              new Date().toISOString(),
              row.id,
            ],
            (err) => {
              if (err) console.error("Error updating result:", err.message);
              else getSessions((sessions) => io.emit("syncSessions", sessions));
            }
          );
        } else {
          db.run(
            "INSERT INTO results (sessionId, timestamp, storySummary, storyDescription, finalEstimate, votes) VALUES (?, ?, ?, ?, ?, ?)",
            [
              currentSessionId,
              new Date().toISOString(),
              currentStory.summary,
              currentStory.description,
              currentStory.finalEstimate || null,
              JSON.stringify(result.votes),
            ],
            (err) => {
              if (err) console.error("Error saving result:", err.message);
              else getSessions((sessions) => io.emit("syncSessions", sessions));
            }
          );
        }
      }
    );
  }
}

async function sendToSlack(sessionResults, currentSession) {
  if (!sessionResults || sessionResults.length === 0) return;
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
