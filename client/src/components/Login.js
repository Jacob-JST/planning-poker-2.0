import React, { useState, useEffect } from "react";
import { Box, Typography, TextField, Button, IconButton } from "@mui/material";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

function Login({ socket, darkMode, onDarkModeToggle, onLogin }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [socketReady, setSocketReady] = useState(false);

  useEffect(() => {
    if (socket) {
      socket.on("connect", () => {
        console.log("Socket connected in Login");
        setSocketReady(true);
      });
      socket.on("connect_error", () => {
        setSocketReady(false);
        setError("Failed to connect to server");
      });
      return () => {
        socket.off("connect");
        socket.off("connect_error");
      };
    }
  }, [socket]);

  const handleLogin = () => {
    if (!name.trim()) {
      setError("Please enter a name");
      return;
    }
    if (!socket || !socketReady) {
      setError("Server not connected yet");
      return;
    }
    socket.emit("login", name);
    socket.on("loginError", (msg) => setError(msg));
    socket.on("setAdmin", (isAdmin, adminId) => {
      onLogin(name, isAdmin, adminId);
    });
  };

  const handleGoogleLogin = async () => {
    if (!socket || !socketReady) {
      setError("Server not connected yet");
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const googleName = user.displayName || user.email.split("@")[0];
      socket.emit("login", googleName);
      socket.on("loginError", (msg) => setError(msg));
      socket.on("setAdmin", (isAdmin, adminId) => {
        onLogin(googleName, isAdmin, adminId);
      });
    } catch (err) {
      console.error("Google login error:", err);
      setError("Failed to login with Google");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        bgcolor: darkMode ? "#121212" : "#f0f0f0",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}
      >
        <IconButton
          onClick={onDarkModeToggle}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
        </IconButton>
        <Box
          sx={{
            bgcolor: darkMode ? "#1d1d1d" : "white",
            p: 4,
            borderRadius: 2,
            boxShadow: 3,
            width: "300px",
            textAlign: "center",
          }}
        >
          <Typography
            variant="h5"
            sx={{
              mb: 2,
              animation: "fadeIn 1s ease-out",
              "@keyframes fadeIn": {
                "0%": { opacity: 0, transform: "translate(-20px, -20px)" },
                "100%": { opacity: 1, transform: "translate(0, 0)" },
              },
            }}
          >
            Planning Poker Login
          </Typography>
          <TextField
            label="Enter your name"
            variant="outlined"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
            error={!!error}
            helperText={error}
          />
          <Button
            variant="contained"
            onClick={handleLogin}
            sx={{ mb: 2 }}
            fullWidth
            disabled={!socketReady}
          >
            Login
          </Button>
          <Button
            variant="outlined"
            onClick={handleGoogleLogin}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2,
            }}
            fullWidth
            disabled={!socketReady}
          >
            <img
              src="https://developers.google.com/identity/images/g-logo.png"
              alt="Google"
              style={{ width: 20, marginRight: 8 }}
            />
            Login with Google
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default Login;
