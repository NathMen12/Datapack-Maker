import { create } from 'zustand';
import i18n from '../i18n/index.js';
import { api } from '../api/client.js';

const DEFAULTS = {
  language: i18n.language?.startsWith('en') ? 'en' : 'fr',
  autocompleteEnabled: true,
  autocompleteDelay: 700,
  autosaveDelay: 1200,
  fontSize: 14,
  theme: 'dark',
};

function loadLocal() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('dpm-settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useSettings = create((set, get) => ({
  ...loadLocal(),

  update: async (partial) => {
    const next = { ...get(), ...partial };
    set(next);
    localStorage.setItem('dpm-settings', JSON.stringify(next));
    if (partial.language) {
      const { setLanguage } = await import('../i18n/index.js');
      setLanguage(partial.language);
    }
    /* Utilisateur connecte : synchroniser aussi cote serveur */
    try {
      const { useAuth } = await import('./auth.js');
      if (useAuth.getState().user) await api.patchSettings(partial);
    } catch {
      /* hors ligne ou non connecte : settings locaux uniquement */
    }
    return next;
  },
}));

export default useSettings;

