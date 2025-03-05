// /react-planning-poker-2.0/client/src/components/Summary.js
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
  const [sessionVelocity, setSessionVelocity] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchVelocity = () => {
      setLoading(true);
      socket.emit("getSessionVelocity", sessionId);
    };

    setAnimate(true);
    fetchVelocity();
    setTimeout(() => setAnimate(false), 1000);

    socket.on("sessionVelocity", (velocity) => {
      if (mounted) {
        console.log("Received sessionVelocity:", velocity);
        setSessionVelocity(velocity || 0);
        setLoading(false);
      }
    });

    socket.on("updateVelocity", (newVelocity) => {
      if (mounted) {
        console.log("Received updateVelocity:", newVelocity);
        setSessionVelocity(newVelocity);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      socket.off("sessionVelocity");
      socket.off("updateVelocity");
    };
  }, [summary, sessionId, socket]);

  const aggregatedSummary = {};
  summary.forEach((s) => {
    const key = `${s.story.summary} - ${s.story.description}`;
    if (!aggregatedSummary[key]) aggregatedSummary[key] = [];
    aggregatedSummary[key].push({
      votes: s.votes,
      finalEstimate: s.story.finalEstimate,
      round: s.round,
    });
  });

  const cards = Object.keys(aggregatedSummary).map((storyKey) => {
    const [summaryText, description] = storyKey.split(" - ");
    const rounds = aggregatedSummary[storyKey].map((roundData) => ({
      round: roundData.round,
      votesList: roundData.votes
        .map(
          (v) => `${displayFullName ? v.user : v.user.split(" ")[0]}: ${v.vote}`
        )
        .join(", "),
      finalEstimate: roundData.finalEstimate,
    }));
    const latestFinalEstimate =
      aggregatedSummary[storyKey]
        .slice()
        .reverse()
        .find((roundData) => roundData.finalEstimate)?.finalEstimate ||
      "Not set";
    return {
      summaryText,
      description,
      rounds,
      finalEstimate: latestFinalEstimate,
    };
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
      <Typography variant="h6" gutterBottom>
        Total Velocity: {loading ? "Calculating..." : sessionVelocity}
      </Typography>
      {cards.length > 0 ? (
        <Grid container spacing={2} justifyContent="center">
          {cards.map((card, index) => (
            <Grid item xs={12} sm={6} key={index}>
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "grey.300",
                  borderRadius: 1,
                  p: 2,
                  minHeight: 250,
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
                  {card.rounds.map((round, rIndex) => (
                    <Box key={rIndex} sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">
                        Round {round.round}
                      </Typography>
                      <Typography variant="body2">
                        Votes: {round.votesList}
                      </Typography>
                      {round.finalEstimate && (
                        <Typography variant="body2">
                          Round Final Estimate: {round.finalEstimate}
                        </Typography>
                      )}
                    </Box>
                  ))}
                  <Typography variant="subtitle1" fontWeight="bold">
                    Final Estimate
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {card.finalEstimate}
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
