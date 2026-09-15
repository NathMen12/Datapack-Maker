const BASE = '/api';

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  /* Auth */
  register: (p) => request('/auth/register', { method: 'POST', body: p }),
  login: (p) => request('/auth/login', { method: 'POST', body: p }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/users/me'),

  /* Settings serveur */
  getSettings: () => request('/settings'),
  patchSettings: (p) => request('/settings', { method: 'PATCH', body: p }),

  /* Projets */
  getProject: (id) => request(`/projects/${id}`),
  listProjects: () => request('/projects/me'),
  createProject: (p) => request('/projects', { method: 'POST', body: p }),
  updateProject: (id, p) => request(`/projects/${id}`, { method: 'PATCH', body: p }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  getFiles: (id) => request(`/projects/${id}/files`),
  saveFiles: (id, saves, deletes = []) =>
    request(`/projects/${id}/files`, { method: 'PUT', body: { saves, deletes } }),
  setIcon: (id, icon) => request(`/projects/${id}/icon`, { method: 'POST', body: { icon } }),

  /* IA */
  aiComplete: (p) => request('/ai/complete', { method: 'POST', body: p }),
  aiQuota: () => request('/ai/quota'),
};

export default api;
