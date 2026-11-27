import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || cooldownSeconds > 0 || submitting) {
      return;
    }

    if (!isSupabaseConfigured) {
      setConfigError(
        'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Do not reveal account existence or internal errors
    } finally {
      setSubmitting(false);
      // Always display the exact same message regardless of whether the email exists
      setSubmittedMessage(
        'If an account exists for this email, a reset link has been sent'
      );
      setCooldownSeconds(60);
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
            Reset your password
          </h1>
          <p
            className="text-body-sm"
            style={{
              color: 'var(--color-secondary)',
              marginTop: 'var(--space-xs)',
            }}
          >
            Enter your account email and we will send you a password reset link.
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
              id="reset-email"
              label="Email address"
              type="email"
              placeholder="manager@supermarket.rw"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            {configError && (
              <div
                className="text-body-sm"
                style={{
                  color: 'var(--color-error)',
                  padding: '8px 10px',
                  backgroundColor: '#FCECEC',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {configError}
              </div>
            )}

            {submittedMessage && (
              <div
                className="text-body-sm"
                style={{
                  color: 'var(--color-primary)',
                  backgroundColor: 'var(--color-primary-20)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {submittedMessage}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || cooldownSeconds > 0}
              style={{ width: '100%', marginTop: 'var(--space-xs)' }}
            >
              {submitting
                ? 'Sending...'
                : cooldownSeconds > 0
                ? `Send reset link (${cooldownSeconds}s)`
                : 'Send reset link'}
            </Button>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 'var(--space-xs)',
              }}
            >
              <Link
                to="/login"
                className="ui-btn ui-btn--link text-label-md"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

