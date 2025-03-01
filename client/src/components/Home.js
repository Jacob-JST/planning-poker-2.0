import React, { useState } from "react";
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  Grid,
  Modal,
  TextField,
  Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Settings from "@mui/icons-material/Settings";
import Logout from "@mui/icons-material/Logout";
import PlayArrow from "@mui/icons-material/PlayArrow";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";

function Home({
  myName,
  socket,
  darkMode,
  onDarkModeToggle,
  onLogout,
  sessions,
  pendingSessions,
  users,
  onViewSummary,
  isAdmin,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(null);
  const [sessionName, setSessionName] = useState("");
  const [sprint, setSprint] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  console.log("Home.js: Received users prop:", users);

  const handleOpenModal = (index = null) => {
    if (index !== null) {
      const session = sessions[index];
      setSessionName(session.sessionName);
      setSprint(session.sprint);
      setSprintGoal(session.sprintGoal);
      setDate(session.date);
      setSelectedSessionIndex(index);
    } else {
      setSessionName("");
      setSprint("");
      setSprintGoal("");
      setDate(new Date().toISOString().split("T")[0]);
      setSelectedSessionIndex(null);
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSessionIndex(null);
  };

  const handleSaveSession = () => {
    if (sessionName.trim() && sprint.trim() && sprintGoal.trim() && date) {
      const newSession = { sessionName, sprint, sprintGoal, date };
      if (isAdmin) {
        if (selectedSessionIndex !== null) {
          newSession.id = sessions[selectedSessionIndex].id;
          socket.emit("updateSession", newSession);
        } else {
          socket.emit("saveSession", newSession);
        }
      } else {
        socket.emit("proposeSession", newSession);
      }
      handleCloseModal();
    } else {
      alert("Please fill in all fields to save or propose a session.");
    }
  };

  const handleLaunchNow = () => {
    if (sessionName.trim() && sprint.trim() && sprintGoal.trim() && date) {
      const newSession = { sessionName, sprint, sprintGoal, date };
      if (selectedSessionIndex !== null) {
        newSession.id = sessions[selectedSessionIndex].id;
      }
      socket.emit("startSession", newSession);
      handleCloseModal();
    } else {
      alert("Please fill in all fields to launch a session.");
    }
  };

  const handleLaunchSession = (index) => {
    const session = sessions[index];
    socket.emit("startSession", session);
  };

  const handleDeleteSession = (index) => {
    setSessionToDelete(sessions[index]);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (sessionToDelete) {
      socket.emit("deleteSession", sessionToDelete.id);
      setDeleteModalOpen(false);
      setSessionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalOpen(false);
    setSessionToDelete(null);
  };

  const handleApproveSession = (sessionId) => {
    socket.emit("approveSession", sessionId);
  };

  const handleSessionClick = (index) => {
    const sessionSummary = sessions[index];
    if (sessionSummary.results && sessionSummary.results.length > 0) {
      onViewSummary(sessionSummary);
    } else {
      handleOpenModal(index);
    }
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", position: "relative" }}>
      <IconButton
        onClick={onDarkModeToggle}
        sx={{ position: "absolute", top: 8, right: 8 }}
      >
        {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
      <Drawer
        variant="permanent"
        sx={{
          width: 220,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: 220, boxSizing: "border-box" },
        }}
      >
        <List>
          <ListItem>
            <ListItemText
              primary={myName}
              primaryTypographyProps={{ variant: "h6" }}
            />
          </ListItem>
          <ListItem>
            <Typography variant="subtitle2" color="textSecondary">
              Users Online:
            </Typography>
          </ListItem>
          {users.map((user) => (
            <ListItem key={user.id}>
              <ListItemText
                primary={`${user.name} is here`}
                secondaryTypographyProps={{ color: "textPrimary" }}
              />
            </ListItem>
          ))}
        </List>
        <Box sx={{ flexGrow: 1 }} />
        <List sx={{ position: "absolute", bottom: 0, width: "100%" }}>
          <ListItem>
            <IconButton disabled>
              <Settings />
            </IconButton>
          </ListItem>
          <ListItem>
            <IconButton onClick={onLogout}>
              <Logout />
            </IconButton>
          </ListItem>
        </List>
      </Drawer>
      <Box sx={{ flexGrow: 1, p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Planning Poker Sessions
        </Typography>
        <Grid container spacing={2}>
          <Grid item>
            <Box
              sx={{
                width: 200,
                height: 200,
                border: "1px solid",
                borderColor: "grey.300",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                "&:hover": { bgcolor: "grey.100" },
              }}
              onClick={() => handleOpenModal()}
            >
              <AddIcon sx={{ fontSize: 60 }} />
            </Box>
          </Grid>
          {sessions.map((session, index) => {
            const isEnded = session.results && session.results.length > 0;
            return (
              <Grid item key={session.id}>
                <Box
                  sx={{
                    width: 200,
                    height: 200,
                    border: "2px solid",
                    borderColor: isEnded ? "grey.500" : "success.main",
                    borderRadius: 1,
                    p: 2,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                  onClick={() => handleSessionClick(index)}
                >
                  <Box sx={{ textAlign: "left" }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {session.sessionName}
                    </Typography>
                    <Typography variant="body2">
                      Sprint: {session.sprint}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {session.sprintGoal}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="body2">{session.date}</Typography>
                    <Box>
                      {isEnded ? (
                        <Typography
                          variant="body2"
                          sx={{ fontStyle: "italic" }}
                        >
                          Session ended
                        </Typography>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLaunchSession(index);
                          }}
                        >
                          <PlayArrow />
                        </IconButton>
                      )}
                      {isAdmin && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(index);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
        {pendingSessions.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 4 }}>
              Pending Session Proposals
            </Typography>
            <Grid container spacing={2}>
              {pendingSessions.map((session) => (
                <Grid item key={session.id}>
                  <Box
                    sx={{
                      width: 200,
                      height: 200,
                      border: "2px dashed",
                      borderColor: "warning.main",
                      borderRadius: 1,
                      p: 2,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <Box sx={{ textAlign: "left" }}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {session.sessionName}
                      </Typography>
                      <Typography variant="body2">
                        Sprint: {session.sprint}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: "pre-wrap" }}
                      >
                        {session.sprintGoal}
                      </Typography>
                      <Typography variant="body2">
                        Proposed by: {session.proposedBy}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="body2">{session.date}</Typography>
                      {isAdmin && (
                        <IconButton
                          size="small"
                          onClick={() => handleApproveSession(session.id)}
                        >
                          <CheckIcon />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Box>
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
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
            {selectedSessionIndex !== null
              ? "Edit Session"
              : isAdmin
              ? "Create New Session"
              : "Propose a Session"}
          </Typography>
          <TextField
            label="Session Name"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Sprint"
            value={sprint}
            onChange={(e) => setSprint(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Sprint Goal"
            value={sprintGoal}
            onChange={(e) => setSprintGoal(e.target.value)}
            multiline
            rows={4}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Box
            sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}
          >
            <Button
              variant="outlined"
              onClick={handleSaveSession}
              sx={{
                flex: 1,
                borderColor: "#808080",
                color: "#808080",
                "&:hover": { bgcolor: "#f0f0f0", borderColor: "#808080" },
              }}
              title={
                selectedSessionIndex !== null
                  ? "Save changes to this session"
                  : isAdmin
                  ? "Save this session as a draft"
                  : "Propose this session for approval"
              }
            >
              {selectedSessionIndex !== null
                ? "Save Changes"
                : isAdmin
                ? "Save Draft"
                : "Propose Session"}
            </Button>
            {isAdmin && (
              <Button
                variant="contained"
                onClick={handleLaunchNow}
                sx={{
                  flex: 1,
                  bgcolor: "#28a745",
                  "&:hover": { bgcolor: "#218838" },
                }}
                title="Launch the session now"
              >
                Launch Session
              </Button>
            )}
          </Box>
        </Box>
      </Modal>
      <Modal
        open={deleteModalOpen}
        onClose={handleCancelDelete}
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
            Confirm Deletion
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete the session "
            {sessionToDelete?.sessionName}"?
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
            <Button variant="outlined" onClick={handleCancelDelete}>
              Cancel
            </Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}

export default Home;
