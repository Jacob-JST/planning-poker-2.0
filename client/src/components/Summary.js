import React, { useEffect, useState } from "react";
import { Box, Typography, Button, Grid, IconButton } from "@mui/material";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Brightness4Icon from "@mui/icons-material/Brightness4";

function Summary({
  summary,
  sessionName,
  sessionId,
  isAdmin,
  socket,
  darkMode,
  onDarkModeToggle,
  displayFullName,
  onLogout,
  onReturnToLobby,
}) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    setAnimate(true);
    setTimeout(() => setAnimate(false), 1000);
  }, [summary]);

  const aggregatedSummary = {};
  summary.forEach((s) => {
    const key = `${s.story.summary} - ${s.story.description}`;
    aggregatedSummary[key] = {
      votes: {},
      finalEstimate: s.story.finalEstimate,
    };
    s.votes.forEach((v) => (aggregatedSummary[key].votes[v.user] = v.vote));
  });

  const cards = Object.keys(aggregatedSummary).map((storyKey) => {
    const [summaryText, description] = storyKey.split(" - ");
    const votesList = Object.keys(aggregatedSummary[storyKey].votes)
      .map(
        (user) =>
          `${displayFullName ? user : user.split(" ")[0]}: ${
            aggregatedSummary[storyKey].votes[user]
          }`
      )
      .join(", ");
    const finalEstimate = aggregatedSummary[storyKey].finalEstimate;

    return { summaryText, description, votesList, finalEstimate };
  });

  const handleRestartSession = () => {
    socket.emit("restartSession", sessionId);
  };

  return (
    <Box sx={{ p: 4, textAlign: "center", position: "relative" }}>
      <IconButton
        onClick={onDarkModeToggle}
        sx={{ position: "absolute", top: 8, right: 8 }}
      >
        {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
      <Typography variant="h4" gutterBottom>
        Session Summary: {sessionName}
      </Typography>
      {cards.length > 0 ? (
        <Grid container spacing={2} justifyContent="center">
          {cards.map((card, index) => (
            <Grid item xs={12} sm={4} key={index}>
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "grey.300",
                  borderRadius: 1,
                  p: 2,
                  height: 250,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  overflow: "auto",
                  animation: animate ? "fadeIn 1s ease-out" : "none",
                  "@keyframes fadeIn": {
                    "0%": { opacity: 0, transform: "translate(-20px, -20px)" },
                    "100%": { opacity: 1, transform: "translate(0, 0)" },
                  },
                }}
              >
                <Box sx={{ textAlign: "left", overflowWrap: "break-word" }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Summary
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {card.summaryText}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Description
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ mb: 1, whiteSpace: "pre-wrap" }}
                  >
                    {card.description}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Votes
                  </Typography>
                  <Typography variant="body2">{card.votesList}</Typography>
                </Box>
                <Box sx={{ textAlign: "left" }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Final Estimate
                  </Typography>
                  <Typography variant="body2">
                    {card.finalEstimate || "Not set"}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography variant="body1">No stories were voted on.</Typography>
      )}
      <Box sx={{ mt: 2, display: "flex", justifyContent: "center", gap: 2 }}>
        <Button variant="contained" onClick={onReturnToLobby}>
          Return to Lobby
        </Button>
        <Button variant="contained" color="secondary" onClick={onLogout}>
          Log Out
        </Button>
        {isAdmin && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleRestartSession}
          >
            Restart Session
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default Summary;
