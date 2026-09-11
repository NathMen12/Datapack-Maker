import { create } from 'zustand';
import { api } from '../api/client.js';

export const useAuth = create((set, get) => ({
  user: null,
  ready: false,

  init: async () => {
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },

  login: async (creds) => {
    const { user } = await api.login(creds);
    set({ user });
  },

  register: async (creds) => {
    const { user } = await api.register(creds);
    set({ user });
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
}));

export default useAuth;
