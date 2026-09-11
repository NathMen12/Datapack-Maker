import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Braces, Sparkles, FolderDown, Save, Palette, Languages, LogIn, PenTool, ChevronRight } from 'lucide-react';
import { useAuth } from '../stores/auth.js';

const FEATURES = [
  { icon: Braces, key: 'feature1' },
  { icon: Sparkles, key: 'feature2' },
  { icon: FolderDown, key: 'feature3' },
  { icon: Save, key: 'feature4' },
  { icon: Palette, key: 'feature5' },
  { icon: Languages, key: 'feature6' },
];

export default function Landing() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);

  return (
    <div className="min-h-full flex flex-col">
      {/* Barre de navigation */}
      <header className="border-b sticky top-0 z-40 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(13,17,23,.85)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Braces className="text-emerald-400" size={22} />
            {t('app.name')}
          </Link>
          <nav className="flex items-center gap-3">
            {user ? (
              <>
                <Link to="/dashboard" className="btn btn-ghost">{t('app.dashboard')}</Link>
                <Link to="/studio" className="btn btn-primary flex items-center gap-1">
                  {t('app.openStudio')} <ChevronRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost flex items-center gap-1"><LogIn size={16} />{t('app.login')}</Link>
                <Link to="/register" className="btn btn-primary flex items-center gap-1"><PenTool size={16} />{t('app.register')}</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight">{t('app.name')}</h1>
          <p className="mt-4 text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
            {t('app.tagline')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/studio" className="btn btn-primary !px-6 !py-3 !text-lg flex items-center gap-2">
              <PenTool size={20} /> {t('app.openStudio')}
            </Link>
            {!user && (
              <Link to="/login" className="btn btn-ghost !px-6 !py-3 !text-lg flex items-center gap-2">
                <LogIn size={20} /> {t('app.login')}
              </Link>
            )}
          </div>
          <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>{t('app.description')}</p>
        </section>

        {/* Fonctionnalites */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <h2 className="text-2xl font-bold mb-8 text-center">{t('landing.features')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="rounded-xl p-5"
                style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
              >
                <Icon size={26} className="mb-3 text-emerald-400" />
                <h3 className="font-semibold mb-1">{t(`landing.${key}Title`)}</h3>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>{t(`landing.${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-6" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 text-sm text-center" style={{ color: 'var(--muted)' }}>
          {t('app.name')} — V1
        </div>
      </footer>
    </div>
  );
}
