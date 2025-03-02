// /react-planning-poker-2.0/client/src/App.js
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
  const [myRole, setMyRole] = useState("User");
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
  const [displayFullName, setDisplayFullName] = useState(true);

  useEffect(() => {
    const savedMode = localStorage.getItem("darkMode") === "true";
    const savedNameDisplay =
      localStorage.getItem("displayFullName") !== "false";
    setDarkMode(savedMode);
    setDisplayFullName(savedNameDisplay);
    const newSocket = io("http://localhost:3001", { reconnection: false });
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => {
      console.log("Connected to server");
      if (myName) socket.emit("login", myName);
    });

    socket.on("updateUsers", (usersData) => {
      console.log("Received updateUsers:", usersData);
      setUsers(usersData);
      const me = usersData.find((u) => u.name === myName);
      if (me) {
        console.log(`Setting myRole for ${myName} to ${me.role}`);
        setMyRole(me.role);
      } else {
        console.log(`User ${myName} not found in usersData`);
      }
    });

    socket.on("setAdmin", (adminStatus, receivedAdminId) => {
      console.log(
        `setAdmin: isAdmin=${adminStatus}, adminId=${receivedAdminId}`
      );
      setIsAdmin(adminStatus);
      setAdminId(receivedAdminId);
      if (screen === "login" && myName) setScreen("home");
    });

    socket.on("loginError", (message) => {
      alert(message);
      setMyName("");
    });

    socket.on("syncSessions", (allSessions) => {
      setSessions(allSessions);
    });

    socket.on("syncPendingSessions", (pending) => {
      setPendingSessions(pending);
    });

    socket.on("startSession", (sessionData) => {
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
            setSelectedSessionSummary(newSessions[existingIndex]);
          }
          return newSessions;
        });
        setScreen("summary");
      }
    });

    socket.on("serverClosed", () => {
      setScreen("farewell");
      socket.disconnect();
    });

    socket.on("connect_error", (error) => {
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
  }, [socket, screen, myName]);

  const handleLogin = (name, isAdmin, adminId) => {
    setMyName(name);
    setIsAdmin(isAdmin);
    setAdminId(adminId);
    setScreen("home");
  };

  const handleDarkModeToggle = () => {
    setDarkMode((prevMode) => {
      const newMode = !prevMode;
      localStorage.setItem("darkMode", newMode);
      return newMode;
    });
  };

  const handleNameDisplayToggle = () => {
    setDisplayFullName((prev) => {
      const newValue = !prev;
      localStorage.setItem("displayFullName", newValue);
      return newValue;
    });
  };

  const handleLogout = () => {
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
    setSelectedSessionSummary(sessionData);
    setScreen("summary");
  };

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {screen === "login" && (
        <Login
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          onLogin={handleLogin}
        />
      )}
      {screen === "home" && (
        <Home
          myName={myName}
          myRole={myRole}
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          onNameDisplayToggle={handleNameDisplayToggle}
          displayFullName={displayFullName}
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
          myRole={myRole}
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
          displayFullName={displayFullName}
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
          }
          isAdmin={isAdmin}
          socket={socket}
          darkMode={darkMode}
          onDarkModeToggle={handleDarkModeToggle}
          displayFullName={displayFullName}
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
