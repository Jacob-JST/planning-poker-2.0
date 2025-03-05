// /react-planning-poker-2.0/client/src/components/Game.js
import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Modal,
  IconButton,
  ListSubheader,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from "@mui/material";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Brightness4Icon from "@mui/icons-material/Brightness4";

function Game({
  myName,
  myRole,
  isAdmin,
  adminId,
  users,
  story,
  myVote,
  votes,
  timer,
  showVotes,
  socket,
  darkMode,
  onDarkModeToggle,
  displayFullName,
  sessionName,
}) {
  const [summaryInput, setSummaryInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [finalEstimate, setFinalEstimate] = useState("");
  const [jiraUrl, setJiraUrl] = useState("");
  const [submitDisabled, setSubmitDisabled] = useState(false);
  const [timerDisabled, setTimerDisabled] = useState(true);
  const [endVotingDisabled, setEndVotingDisabled] = useState(true);
  const [revoteDisabled, setRevoteDisabled] = useState(true);
  const [estimateDisabled, setEstimateDisabled] = useState(true);
  const [finalEstimateSubmitted, setFinalEstimateSubmitted] = useState(false);
  const [localStory, setLocalStory] = useState(story);
  const [localTimer, setLocalTimer] = useState(timer);
  const [timerColor, setTimerColor] = useState("inherit");
  const [localShowVotes, setLocalShowVotes] = useState(showVotes);
  const [localVotes, setLocalVotes] = useState(votes);
  const [localUsers, setLocalUsers] = useState(users);
  const [localMyVote, setLocalMyVote] = useState(myVote);
  const [cardsEnabled, setCardsEnabled] = useState(false);
  const [jiraModalOpen, setJiraModalOpen] = useState(false);
  const [jiraImportUrl, setJiraImportUrl] = useState("");
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [storyAnimation, setStoryAnimation] = useState(false);
  const [timerValue, setTimerValue] = useState(null);
  const [maxTimerValue, setMaxTimerValue] = useState(null);
  const [velocity, setVelocity] = useState(0);
  const fibonacci = [1, 2, 3, 5, 8, 13, 21, 34];

  useEffect(() => {
    console.log(
      `${myName}: Game component mounted. isAdmin:`,
      isAdmin,
      "myRole:",
      myRole,
      "users:",
      localUsers,
      "socket connected:",
      socket.connected
    );

    socket.on("startSession", () => {
      setVelocity(0);
      setTimerDisabled(!isAdmin);
      setRevoteDisabled(true);
      console.log(`${myName}: Start session, timerDisabled:`, !isAdmin);
    });

    socket.on("updateStory", (newStory) => {
      console.log(`${myName}: Received updateStory:`, newStory);
      setLocalStory(newStory);
      const hasFinalEstimate = !!newStory.finalEstimate;
      setTimerDisabled(!isAdmin || hasFinalEstimate);
      console.log(
        `${myName}: Updated timerDisabled to`,
        !isAdmin || hasFinalEstimate,
        "isAdmin:",
        isAdmin,
        "hasFinalEstimate:",
        hasFinalEstimate
      );
      setEndVotingDisabled(hasFinalEstimate);
      setRevoteDisabled(hasFinalEstimate);
      setEstimateDisabled(!hasFinalEstimate);
      setFinalEstimate("");
      setLocalMyVote(null);
      setCardsEnabled(!hasFinalEstimate);
      setLocalTimer("");
      setTimerValue(null);
      setMaxTimerValue(null);
      setPulseAnimation(false);
      setStoryAnimation(true);
      setTimeout(() => setStoryAnimation(false), 1000);
    });

    socket.on("updateVotes", (votesData, usersData) => {
      console.log(
        `${myName}: Received updateVotes:`,
        votesData,
        "Users:",
        usersData
      );
      setLocalVotes(votesData);
      setLocalUsers(usersData);
    });

    socket.on("startTimerSync", (seconds) => {
      console.log(`${myName}: Received startTimerSync with seconds:`, seconds);
      setMaxTimerValue(seconds);
      setTimerValue(seconds);
      setLocalTimer(
        `${Math.floor(seconds / 60)}:${
          seconds % 60 < 10 ? "0" + (seconds % 60) : seconds % 60
        }`
      );
    });

    socket.on("timerUpdate", (timeLeft) => {
      console.log(
        `${myName}: Timer update:`,
        timeLeft,
        "timerValue:",
        timeLeft,
        "maxTimerValue:",
        maxTimerValue
      );
      if (timeLeft > 0) {
        const minutes = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${minutes}:${secs < 10 ? "0" + secs : secs}`;
        setLocalTimer(timeStr);
        setTimerValue(timeLeft);
        setTimerColor(timeLeft <= 10 ? "red" : "inherit");
        setPulseAnimation(false);
      } else {
        setLocalTimer("0:00");
        setTimerValue(0);
        setMaxTimerValue(null);
        setSubmitDisabled(false);
        setEndVotingDisabled(true);
        setEstimateDisabled(false);
        setCardsEnabled(false);
        setPulseAnimation(true);
        setTimeout(() => {
          setPulseAnimation(false);
          setTimerColor("inherit");
        }, 2000);
      }
    });

    socket.on("showVotes", (votesData, usersData) => {
      console.log(`${myName}: Showing votes:`, votesData, usersData);
      setLocalShowVotes(true);
      setLocalVotes(votesData);
      setLocalUsers(usersData);
      setSubmitDisabled(false);
      setTimerDisabled(true);
      setEndVotingDisabled(true);
      setEstimateDisabled(false);
      setCardsEnabled(false);
    });

    socket.on("hideVotes", () => {
      console.log(`${myName}: Hiding votes`);
      setLocalShowVotes(false);
    });

    socket.on("updateUsers", (usersData) => {
      console.log(`${myName}: Received updateUsers:`, usersData);
      setLocalUsers(usersData);
    });

    socket.on("jiraImportResult", (data) => {
      console.log(`${myName}: Jira import result:`, data);
      if (data.error) {
        console.error(`${myName}: Jira import error:`, data.error);
        alert("Failed to import Jira issue: " + data.error);
      } else {
        setSummaryInput(data.summary);
        setDescriptionInput(data.description);
        setJiraUrl(data.jiraUrl);
        setJiraModalOpen(false);
        setJiraImportUrl("");
      }
    });

    socket.on("jiraUpdateError", (error) => {
      console.error(`${myName}: Jira update error:`, error);
      alert("Failed to update Jira story points: " + error);
    });

    socket.on("finalEstimateSubmitted", ({ estimate }) => {
      console.log(
        `${myName}: Received finalEstimateSubmitted with estimate:`,
        estimate
      );
      setFinalEstimateSubmitted(true);
      setCardsEnabled(false);
      setEstimateDisabled(true);
      setEndVotingDisabled(true);
      setRevoteDisabled(true);
      setTimerDisabled(true);
    });

    socket.on("updateVelocity", (newVelocity) => {
      console.log(`${myName}: Received updateVelocity:`, newVelocity);
      setVelocity(newVelocity);
    });

    socket.on("resetVoting", () => {
      console.log(`${myName}: Received resetVoting`);
      setFinalEstimateSubmitted(false);
      setCardsEnabled(true);
      setEndVotingDisabled(false);
      setRevoteDisabled(true);
      setEstimateDisabled(true);
      setTimerDisabled(!isAdmin);
      console.log(`${myName}: Reset voting, timerDisabled:`, !isAdmin);
    });

    socket.on("enableRevote", () => {
      console.log(`${myName}: Enabling re-vote`);
      setRevoteDisabled(false);
    });

    socket.on("disableRevote", () => {
      console.log(`${myName}: Disabling re-vote`);
      setRevoteDisabled(true);
    });

    return () => {
      socket.off("startSession");
      socket.off("updateStory");
      socket.off("updateVotes");
      socket.off("startTimerSync");
      socket.off("timerUpdate");
      socket.off("showVotes");
      socket.off("hideVotes");
      socket.off("updateUsers");
      socket.off("jiraImportResult");
      socket.off("jiraUpdateError");
      socket.off("finalEstimateSubmitted");
      socket.off("updateVelocity");
      socket.off("resetVoting");
      socket.off("enableRevote");
      socket.off("disableRevote");
    };
  }, [socket, isAdmin, myName, myRole]);

  const handleVote = (number) => {
    if (!cardsEnabled) return;
    console.log(`${myName}: Voting:`, number);
    socket.emit("vote", { vote: number });
    setLocalMyVote(number);
  };

  const handleSubmitStory = () => {
    if (!submitDisabled && summaryInput.trim() && descriptionInput.trim()) {
      const newStory = {
        summary: summaryInput,
        description: descriptionInput,
        jiraUrl: jiraUrl || null,
      };
      console.log(`${myName}: Submitting story:`, newStory);
      socket.emit("newStory", newStory);
      setSummaryInput("");
      setDescriptionInput("");
      setSubmitDisabled(true);
      setFinalEstimateSubmitted(false);
      if (isAdmin) {
        setTimerDisabled(false);
        console.log(`${myName}: Submitted story, timerDisabled set to false`);
      }
    }
  };

  const handleSubmitFinalEstimate = () => {
    if (!estimateDisabled && finalEstimate) {
      console.log(
        `${myName}: Submitting final estimate:`,
        finalEstimate,
        "Jira URL:",
        jiraUrl
      );
      socket.emit("submitFinalEstimate", { estimate: finalEstimate, jiraUrl });
      setFinalEstimate("");
      setEstimateDisabled(true);
      setEndVotingDisabled(true);
      setRevoteDisabled(true);
      setFinalEstimateSubmitted(true);
      setCardsEnabled(false);
      setTimerDisabled(true);
      setJiraUrl("");
    }
  };

  const handleStartTimer = (seconds) => {
    if (!timerDisabled) {
      console.log(`${myName}: Starting timer:`, seconds);
      socket.emit("startTimer", seconds);
      setTimerDisabled(true);
      setMaxTimerValue(seconds);
    }
  };

  const handleEndVoting = () => {
    if (!endVotingDisabled) {
      console.log(`${myName}: Ending voting`);
      socket.emit("endVoting");
      setEndVotingDisabled(true);
      setSubmitDisabled(false);
      setTimerDisabled(true);
      setEstimateDisabled(false);
      if (isAdmin) setRevoteDisabled(false);
    }
  };

  const handleRevote = () => {
    if (!revoteDisabled) {
      console.log(`${myName}: Initiating re-vote`);
      socket.emit("revote");
      setRevoteDisabled(true);
      setCardsEnabled(true);
      setLocalMyVote(null);
      setLocalShowVotes(false);
    }
  };

  const handleEndSession = () => {
    console.log(`${myName}: Ending session`);
    socket.emit("endSession");
  };

  const handleJiraImport = () => {
    if (!jiraImportUrl.trim()) return;
    console.log(`${myName}: Importing Jira:`, jiraImportUrl);
    socket.emit("jiraImport", jiraImportUrl);
  };

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: 220,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: 220, boxSizing: "border-box" },
        }}
      >
        <List sx={{ padding: 0 }}>
          <ListSubheader
            sx={{ display: "flex", bgcolor: "inherit", padding: "0 8px" }}
          >
            <Typography
              variant="subtitle2"
              sx={{ width: 160, textAlign: "left", pl: 2 }}
            >
              User
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{ width: 48, textAlign: "center" }}
            >
              Vote
            </Typography>
          </ListSubheader>
          {localUsers.length > 0 ? (
            localUsers.map((u) => (
              <ListItem
                key={`${u.id}-${u.name}`}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0 8px",
                }}
              >
                <ListItemText
                  primary={displayFullName ? u.name : u.name.split(" ")[0]}
                  sx={{
                    color: u.voted ? "green" : "inherit",
                    flex: "none",
                    width: 160,
                  }}
                />
                {localShowVotes && localVotes[u.id] && (
                  <Button
                    variant="contained"
                    sx={{
                      m: 0,
                      minWidth: "48px",
                      height: "36px",
                      bgcolor: "primary.main",
                      color: "white",
                      pointerEvents: "none",
                      "&:hover": { bgcolor: "primary.dark" },
                    }}
                  >
                    {localVotes[u.id]}
                  </Button>
                )}
              </ListItem>
            ))
          ) : (
            <ListItem>
              <ListItemText primary="No users connected" />
            </ListItem>
          )}
        </List>
      </Drawer>
      <Box
        sx={{
          flexGrow: 1,
          p: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
      >
        <Typography variant="h4" sx={{ mb: 2 }}>
          {sessionName || "Planning Poker"}
        </Typography>
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 60,
            display: "flex",
            alignItems: "center",
          }}
        >
          {timerValue !== null && (
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <CircularProgress
                variant="determinate"
                value={
                  maxTimerValue && timerValue >= 0
                    ? (timerValue / maxTimerValue) * 100
                    : 0
                }
                size={40}
                thickness={4}
                sx={{ color: timerColor }}
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography
                  variant="caption"
                  component="div"
                  color={timerColor}
                  sx={{
                    animation: pulseAnimation
                      ? "pulse 0.5s ease-in-out 4"
                      : "none",
                    "@keyframes pulse": {
                      "0%": { transform: "scale(1)" },
                      "50%": { transform: "scale(1.1)" },
                      "100%": { transform: "scale(1)" },
                    },
                  }}
                >
                  {localTimer}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
        <IconButton
          onClick={onDarkModeToggle}
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
        </IconButton>
        <Box
          sx={{
            position: "absolute",
            top: 60,
            right: 8,
            border: "1px solid",
            borderColor: "grey.300",
            borderRadius: 1,
            p: 1,
            bgcolor: darkMode ? "grey.800" : "grey.100",
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
            Velocity: {velocity}
          </Typography>
        </Box>
        <Box
          sx={{
            width: "100%",
            maxWidth: 600,
            minHeight: 150,
            border: "1px solid",
            borderColor: "grey.300",
            borderRadius: 1,
            mb: 2,
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            overflow: "auto",
            maxHeight: 300,
            animation: storyAnimation ? "fadeIn 1s ease-out" : "none",
            "@keyframes fadeIn": {
              "0%": { opacity: 0, transform: "translate(-20px, -20px)" },
              "100%": { opacity: 1, transform: "translate(0, 0)" },
            },
          }}
        >
          {localStory ? (
            <>
              <TextField
                label="Summary"
                value={localStory.summary}
                InputProps={{ readOnly: true }}
                fullWidth
                variant="outlined"
                sx={{ bgcolor: "background.paper" }}
              />
              <TextField
                label="Description"
                value={localStory.description}
                InputProps={{ readOnly: true }}
                multiline
                minRows={3}
                fullWidth
                variant="outlined"
                sx={{ bgcolor: "background.paper" }}
              />
              {localStory.finalEstimate && (
                <TextField
                  label="Final Estimate"
                  value={localStory.finalEstimate}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  variant="outlined"
                  sx={{ bgcolor: "background.paper" }}
                />
              )}
            </>
          ) : (
            <Typography sx={{ p: 2 }}>No story active</Typography>
          )}
        </Box>
        <Box sx={{ my: 2 }}>
          {fibonacci.map((num) => (
            <Button
              key={num}
              variant={localMyVote === num ? "contained" : "outlined"}
              onClick={() => handleVote(num)}
              disabled={!cardsEnabled}
              sx={{
                m: 1,
                minWidth: "48px",
                height: "36px",
                bgcolor: localMyVote === num ? "primary.main" : "inherit",
                color: localMyVote === num ? "white" : "inherit",
                "&:hover": {
                  bgcolor: localMyVote === num ? "primary.dark" : "grey.200",
                },
                "&.Mui-disabled": {
                  bgcolor: localMyVote === num ? "primary.main" : "grey.300",
                  color: localMyVote === num ? "white" : "grey.700",
                  opacity: 1,
                },
              }}
            >
              {num}
            </Button>
          ))}
        </Box>
        {isAdmin && (
          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Summary"
                value={summaryInput}
                onChange={(e) => setSummaryInput(e.target.value)}
                required
                sx={{ width: 300 }}
              />
              <IconButton
                onClick={() => setJiraModalOpen(true)}
                sx={{ p: 0.5 }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 250 250"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M249.51 125.26c0 68.86-55.88 124.74-124.74 124.74S0 194.12 0 125.26 55.88.51 124.74.51s124.74 55.88 124.74 124.75"
                    fill="url(#paint0_linear_1_2)"
                  />
                  <path
                    d="M128.22 65.38c-2.48 0-4.99 1.42-6.13 3.82l-55.88 90.79c-2.48 4.27-.71 9.26 3.56 11.74 2.14 1.07 4.63 1.42 6.77 1.07l30.43-4.63 25.08 40.62c2.48 4.27 7.47 6.05 11.74 3.56 4.27-2.48 6.05-7.47 3.56-11.74l-25.08-40.62 30.43-4.63c5.34-1.07 9.26-5.34 9.26-10.68 0-2.48-1.07-5.34-2.85-7.12L134.35 69.2c-1.43-2.49-4.28-3.82-6.13-3.82Z"
                    fill="#fff"
                  />
                  <defs>
                    <linearGradient
                      id="paint0_linear_1_2"
                      x1="124.74"
                      y1=".51"
                      x2="124.74"
                      y2="250"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#253858" />
                      <stop offset="1" stopColor="#1C2942" />
                    </linearGradient>
                  </defs>
                </svg>
              </IconButton>
            </Box>
            <TextField
              label="Description"
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              required
              multiline
              rows={4}
              sx={{ width: 300 }}
            />
            <Button
              id="submitStory"
              onClick={handleSubmitStory}
              variant="contained"
              disabled={submitDisabled}
            >
              Submit Story
            </Button>
            <Box>
              <Button
                id="timer30s"
                onClick={() => handleStartTimer(30)}
                variant="outlined"
                sx={{ mr: 1 }}
                disabled={timerDisabled}
              >
                30s
              </Button>
              <Button
                id="timer1m"
                onClick={() => handleStartTimer(60)}
                variant="outlined"
                sx={{ mr: 1 }}
                disabled={timerDisabled}
              >
                1m
              </Button>
              <Button
                id="timer5m"
                onClick={() => handleStartTimer(300)}
                variant="outlined"
                disabled={timerDisabled}
              >
                5m
              </Button>
            </Box>
            <Button
              id="endVoting"
              onClick={handleEndVoting}
              variant="outlined"
              disabled={endVotingDisabled}
            >
              End Voting
            </Button>
            <Button
              id="revote"
              onClick={handleRevote}
              variant="outlined"
              disabled={revoteDisabled}
            >
              Re-Vote
            </Button>
            <FormControl sx={{ width: 300 }}>
              <InputLabel>Final Estimate</InputLabel>
              <Select
                value={finalEstimate}
                onChange={(e) => setFinalEstimate(e.target.value)}
                disabled={estimateDisabled}
                label="Final Estimate"
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {fibonacci.map((num) => (
                  <MenuItem key={num} value={num}>
                    {num}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              onClick={handleSubmitFinalEstimate}
              variant="contained"
              disabled={estimateDisabled || !finalEstimate}
            >
              Submit Final Estimate
            </Button>
            <Button
              onClick={handleEndSession}
              variant="contained"
              color="secondary"
            >
              End Session
            </Button>
          </Box>
        )}
      </Box>
      <Modal
        open={jiraModalOpen}
        onClose={() => setJiraModalOpen(false)}
        sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Box
          sx={{
            bgcolor: "background.paper",
            p: 4,
            borderRadius: 2,
            width: 400,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Import Jira Issue
          </Typography>
          <TextField
            label="Jira Issue URL"
            value={jiraImportUrl}
            onChange={(e) => setJiraImportUrl(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Button variant="contained" onClick={handleJiraImport}>
            Import
          </Button>
        </Box>
      </Modal>
    </Box>
  );
}

export default Game;
