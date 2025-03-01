import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Brightness4Icon from '@mui/icons-material/Brightness4';

function Farewell({ darkMode, onDarkModeToggle }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', position: 'relative' }}>
      <IconButton
        onClick={onDarkModeToggle}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        {darkMode ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
      <Typography variant="h3">Thanks for playing!</Typography>
    </Box>
  );
}

export default Farewell;
