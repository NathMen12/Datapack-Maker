import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/index.js';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
