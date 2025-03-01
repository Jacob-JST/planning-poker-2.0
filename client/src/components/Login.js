import React, { useState } from 'react';
import { Box, TextField, Button, Typography, IconButton } from '@mui/material';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Brightness4Icon from '@mui/icons-material/Brightness4';

function Login({ onLogin, darkMode, onDarkModeToggle }) {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    if (name.trim()) onLogin(name);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', position: 'relative' }}>
      <IconButton
        onClick={onDarkModeToggle}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
      <Box sx={{ textAlign: 'center', p: 4, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
        <Typography variant="h4" gutterBottom>Planning Poker</Typography>
        <TextField
          label="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mb: 2, width: '100%' }}
        />
        <Button variant="contained" onClick={handleSubmit}>Join</Button>
      </Box>
    </Box>
  );
}

export default Login;
