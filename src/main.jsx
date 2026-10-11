import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { useStore } from './store.js';

// Read by the desktop app's self-tests (electron/main.js) to report game state.
window.__gun = { useStore };

createRoot(document.getElementById('root')).render(<App />);
