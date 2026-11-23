import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const LoginPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/products" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage(
        'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured in .env.'
      );
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-md)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <h1
            className="text-headline-sm"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Supermarket Stock &amp; Profit System
          </h1>
          <p
            className="text-body-sm"
            style={{
              color: 'var(--color-secondary)',
              marginTop: 'var(--space-xs)',
            }}
          >
            Sign in with your manager or clerk account to continue.
          </p>
        </div>

        <Card style={{ padding: 'var(--space-md)' }}>
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-sm)',
            }}
          >
            <Input
              id="email"
              label="Email address"
              type="email"
              placeholder="manager@supermarket.rw"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {errorMessage && (
              <div
                className="text-body-sm"
                style={{
                  color: 'var(--color-error)',
                  padding: '8px 10px',
                  backgroundColor: '#FCECEC',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              style={{ width: '100%', marginTop: 'var(--space-xs)' }}
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

