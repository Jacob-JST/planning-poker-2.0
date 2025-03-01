import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { ThemeProvider, CssBaseline, createTheme } from "@mui/material";
import Login from "./components/Login";
import Home from "./components/Home";
import Game from "./components/Game";
import Summary from "./components/Summary";
import Farewell from "./components/Farewell";

function App() {
  const [socket, setSocket] = useState(null);
  const [screen, setScreen] = useState("login");
  const [myName, setMyName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState(null);
  const [users, setUsers] = useState([]);
  const [story, setStory] = useState("");
  const [myVote, setMyVote] = useState(null);
  const [votes, setVotes] = useState({});
  const [timer, setTimer] = useState("");
  const [sessions, setSessions] = useState([]);
  const [pendingSessions, setPendingSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [selectedSessionSummary, setSelectedSessionSummary] = useState(null);
  const [showVotes, setShowVotes] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("darkMode") === "true";
    setDarkMode(savedMode);
    const newSocket = io("http://localhost:3001", { reconnection: false });
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  const theme = createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
      primary: { main: "#1976d2" },
      secondary: { main: "#dc004e" },
      background: {
        default: darkMode ? "#303030" : "#f5f5f5",
        paper: darkMode ? "#424242" : "#fff",
      },
    },
    typography: { fontFamily: "Roboto, sans-serif" },
  });

  useEffect(() => {
    if (!socket) return;

    console.log("App mounted or socket changed");

    socket.on("connect", () => {
      console.log("Connected to server");
      if (myName) {
        console.log("Re-emitting login:", myName);
        socket.emit("login", myName);
      }
    });

    socket.on("updateUsers", (usersData) => {
      console.log("Received updateUsers:", usersData);
      setUsers(usersData);
    });

    socket.on("setAdmin", (adminStatus, receivedAdminId) => {
      console.log(`Set admin: ${adminStatus}, Admin ID: ${receivedAdminId}`);
      setIsAdmin(adminStatus);
      setAdminId(receivedAdminId);
      if (screen === "login" && myName) setScreen("home");
    });

    socket.on("loginError", (message) => {
      console.error("Login error:", message);
      alert(message);
      setMyName("");
    });

    socket.on("syncSessions", (allSessions) => {
      console.log("Received syncSessions:", allSessions);
      setSessions(allSessions);
    });

    socket.on("syncPendingSessions", (pending) => {
      console.log("Received syncPendingSessions:", pending);
      setPendingSessions(pending);
      console.log("Updated pendingSessions state to:", pending);
    });

    socket.on("startSession", (sessionData) => {
      console.log("Received startSession:", sessionData);
      setCurrentSession(sessionData);
      setStory("");
      setMyVote(null);
      setVotes({});
      setTimer("");
      setShowVotes(false);
      setScreen("game");
    });

    socket.on("updateStory", (newStory) => {
      setStory(newStory);
      setMyVote(null);
      setVotes({});
      setTimer("");
      setShowVotes(false);
    });

    socket.on("updateVotes", (votesData, usersData) => {
      setVotes(votesData);
      setUsers(usersData);
    });

    socket.on("timerUpdate", (timeLeft) => {
      if (timeLeft > 0) {
        const minutes = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        setTimer(`Time left: ${minutes}:${secs < 10 ? "0" + secs : secs}`);
      } else {
        setTimer("Time’s up!");
      }
    });

    socket.on("showVotes", () => setShowVotes(true));
    socket.on("hideVotes", () => setShowVotes(false));

    socket.on("sessionSummary", (summary) => {
      if (currentSession) {
        setSessions((prev) => {
          const newSessions = [...prev];
          const existingIndex = newSessions.findIndex(
            (s) => s.id === currentSession.id
          );
          if (existingIndex !== -1) {
            newSessions[existingIndex].results = summary;
            console.log("Updated session summary:", newSessions[existingIndex]);
            setSelectedSessionSummary(newSessions[existingIndex]);
          }
          return newSessions;
        });
        setScreen("summary");
      }
    });

    socket.on("serverClosed", () => {
      console.log("Server closed, switching to farewell");
      setScreen("farewell");
      socket.disconnect();
    });

    socket.on("connect_error", (error) => {
      console.error("Connection error:", error.message);
      alert(
        `Failed to connect to the server: ${error.message}. Please ensure the server is running on http://localhost:3001.`
      );
    });

    return () => {
      socket.off("connect");
      socket.off("updateUsers");
      socket.off("setAdmin");
      socket.off("loginError");
      socket.off("syncSessions");
      socket.off("syncPendingSessions");
      socket.off("startSession");
      socket.off("updateStory");
      socket.off("updateVotes");
      socket.off("timerUpdate");
      socket.off("showVotes");
      socket.off("hideVotes");
      socket.off("sessionSummary");
      socket.off("serverClosed");
      socket.off("connect_error");
    };
  }, [socket, screen, myName, currentSession]);

  const handleLogin = (name) => {
    console.log("Logging in:", name);
    setMyName(name);
    if (socket) socket.emit("login", name);
  };

  const handleDarkModeToggle = () => {
    setDarkMode((prevMode) => {
      const newMode = !prevMode;
      localStorage.setItem("darkMode", newMode);
      return newMode;
    });
  };

  const handleLogout = () => {
    console.log("Logging out:", myName);
    if (socket) socket.disconnect();
    setMyName("");
    setIsAdmin(false);
    setAdminId(null);
    setUsers([]);
    setCurrentSession(null);
    setScreen("login");
    const newSocket = io("http://localhost:3001", { reconnection: false });
    setSocket(newSocket);
  };

  const handleReturnToLobby = () => {
    setScreen("home");
    setCurrentSession(null);
    setSelectedSessionSummary(null);
  };

  const handleViewSummary = (sessionData) => {
    console.log("Viewing summary for session:", sessionData);
    setSelectedSessionSummary(sessionData);
    setScreen("summary");
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {screen === "login" && (
        <Login
          onLogin={handleLogin}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
        />
      )}
      {screen === "home" && (
        <Home
          myName={myName}
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          onLogout={handleLogout}
          sessions={sessions}
          pendingSessions={pendingSessions}
          users={users}
          onViewSummary={handleViewSummary}
          isAdmin={isAdmin}
        />
      )}
      {screen === "game" && users.length > 0 && (
        <Game
          myName={myName}
          isAdmin={isAdmin}
          adminId={adminId}
          users={users}
          story={story}
          myVote={myVote}
          votes={votes}
          timer={timer}
          showVotes={showVotes}
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          sessionName={currentSession?.sessionName}
        />
      )}
      {screen === "summary" && (
        <Summary
          summary={
            selectedSessionSummary
              ? selectedSessionSummary.results
              : sessions.length > 0
              ? sessions[sessions.length - 1].results
              : []
          }
          sessionName={
            selectedSessionSummary
              ? selectedSessionSummary.sessionName
              : sessions.length > 0
              ? sessions[sessions.length - 1].sessionName
              : ""
          }
          sessionId={
            selectedSessionSummary
              ? selectedSessionSummary.id
              : sessions.length > 0
              ? sessions[sessions.length - 1].id
              : null
          } // Pass session ID
          isAdmin={isAdmin}
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          onLogout={handleLogout}
          onReturnToLobby={handleReturnToLobby}
        />
      )}
      {screen === "farewell" && (
        <Farewell darkMode={darkMode} onDarkModeToggle={handleDarkModeToggle} />
      )}
    </ThemeProvider>
  );
}

export default App;
