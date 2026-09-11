import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import en from './en.json';

function detectLang() {
  const saved = localStorage.getItem('dpm-lang');
  if (saved === 'fr' || saved === 'en') return saved;
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: detectLang(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang) {
  localStorage.setItem('dpm-lang', lang);
  i18n.changeLanguage(lang);
}

export default i18n;
