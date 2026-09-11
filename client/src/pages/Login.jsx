import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Braces } from 'lucide-react';
import { useAuth } from '../stores/auth.js';
import { Button, Field } from '../components/ui.jsx';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.status === 401 ? t('auth.invalidCredentials')
        : err.status === 400 ? t('auth.invalidInput')
        : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl p-8" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 justify-center font-bold text-xl mb-6">
          <Braces className="text-emerald-400" size={24} />
          {t('app.name')}
        </div>
        <h1 className="text-xl font-bold mb-6 text-center">{t('auth.loginTitle')}</h1>
        <form onSubmit={submit}>
          <Field label={t('auth.email')}>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label={t('auth.password')}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </Field>
          {error && <p className="mb-4 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button variant="primary" className="w-full" type="submit" disabled={loading}>
            {loading ? '…' : t('auth.submitLogin')}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center" style={{ color: 'var(--muted)' }}>
          {t('auth.noAccount')} <Link to="/register" className="text-emerald-400 hover:underline">{t('auth.register')}</Link>
        </p>
      </div>
    </div>
  );
}
