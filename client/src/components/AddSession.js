// /react-planning-poker-2.0/client/src/components/AddSession.js
import React from "react";
import { Box, Typography, TextField, Button } from "@mui/material";

function AddSession({
  pendingSession,
  setPendingSession,
  handleProposeSession,
  darkMode,
  isAdmin,
}) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Propose New Session
      </Typography>
      <TextField
        label="Session Name"
        value={pendingSession.sessionName}
        onChange={(e) =>
          setPendingSession((prev) => ({
            ...prev,
            sessionName: e.target.value,
          }))
        }
        fullWidth
        sx={{ mb: 2, bgcolor: darkMode ? "#424242" : "white" }}
      />
      <TextField
        label="Sprint"
        value={pendingSession.sprint}
        onChange={(e) =>
          setPendingSession((prev) => ({ ...prev, sprint: e.target.value }))
        }
        fullWidth
        sx={{ mb: 2, bgcolor: darkMode ? "#424242" : "white" }}
      />
      <TextField
        label="Sprint Goal"
        value={pendingSession.sprintGoal}
        onChange={(e) =>
          setPendingSession((prev) => ({ ...prev, sprintGoal: e.target.value }))
        }
        fullWidth
        sx={{ mb: 2, bgcolor: darkMode ? "#424242" : "white" }}
      />
      <TextField
        label="Date"
        type="date"
        value={pendingSession.date}
        onChange={(e) =>
          setPendingSession((prev) => ({ ...prev, date: e.target.value }))
        }
        fullWidth
        sx={{ mb: 2, bgcolor: darkMode ? "#424242" : "white" }}
        InputLabelProps={{ shrink: true }}
      />
      <Button
        variant="contained"
        onClick={handleProposeSession}
        disabled={
          !isAdmin ||
          !pendingSession.sessionName ||
          !pendingSession.sprint ||
          !pendingSession.sprintGoal ||
          !pendingSession.date
        }
      >
        Propose Session
      </Button>
    </Box>
  );
}

export default AddSession;
