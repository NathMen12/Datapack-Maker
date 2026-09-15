import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './stores/auth.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectSettings from './pages/ProjectSettings.jsx';
import Studio from './pages/Studio.jsx';

function RequireAuth({ children }) {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  if (!ready) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const init = useAuth((s) => s.init);
  const ready = useAuth((s) => s.ready);

  useEffect(() => {
    init();
  }, [init]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid var(--border)', borderTopColor: 'var(--accent-2)' }} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Accessible sans compte : les projets locaux (IndexedDB) ont aussi des reglages. */}
        <Route path="/projects/:id/settings" element={<ProjectSettings />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/studio" element={<Studio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
