import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Braces } from 'lucide-react';
import { useAuth } from '../stores/auth.js';
import { Button, Field } from '../components/ui.jsx';

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.status === 409 ? t('auth.emailTaken')
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
        <h1 className="text-xl font-bold mb-6 text-center">{t('auth.registerTitle')}</h1>
        <form onSubmit={submit}>
          <Field label={t('auth.email')}>
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </Field>
          <Field label={t('auth.username')}>
            <input className="input" value={form.username} onChange={set('username')} required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_\-]+" />
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
            <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
          </Field>
          {error && <p className="mb-4 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button variant="primary" className="w-full" type="submit" disabled={loading}>
            {loading ? '…' : t('auth.submitRegister')}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center" style={{ color: 'var(--muted)' }}>
          {t('auth.haveAccount')} <Link to="/login" className="text-emerald-400 hover:underline">{t('app.login')}</Link>
        </p>
      </div>
    </div>
  );
}
