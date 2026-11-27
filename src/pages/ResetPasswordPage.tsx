import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();

  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    // Check URL hash or search params for explicit error codes from Supabase Auth redirect
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, '')
    );
    const searchParams = new URLSearchParams(window.location.search);
    const urlError =
      hashParams.get('error_description') ||
      searchParams.get('error_description') ||
      hashParams.get('error') ||
      searchParams.get('error');

    if (urlError) {
      setLinkError(
        'This password reset link is invalid or has expired. Please request a new reset link.'
      );
      setCheckingSession(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (
        (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') &&
        session
      ) {
        setHasRecoverySession(true);
        setCheckingSession(false);
      }
    });

    // Also check if session is already established or exchange code if present
    const verifyInitialSession = async () => {
      const code = searchParams.get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (!mounted) return;
        if (!error && data.session) {
          setHasRecoverySession(true);
          setCheckingSession(false);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
        return;
      }

      // Allow brief grace window for hash token parsing by supabase-js
      setTimeout(async () => {
        if (!mounted) return;
        const {
          data: { session: delayedSession },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        if (delayedSession) {
          setHasRecoverySession(true);
        } else {
          setLinkError(
            'This password reset link is invalid or has expired. Please request a new reset link.'
          );
        }
        setCheckingSession(false);
      }, 1500);
    };

    verifyInitialSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('New password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setSubmitting(false);
      setFormError(error.message);
      return;
    }

    // Sign out recovery session and send user to /login with a success message
    await supabase.auth.signOut();
    setSubmitting(false);
    navigate('/login', {
      replace: true,
      state: {
        resetSuccessMessage:
          'Your password has been updated. Please sign in with your new password.',
      },
    });
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
            Choose a new password
          </h1>
          <p
            className="text-body-sm"
            style={{
              color: 'var(--color-secondary)',
              marginTop: 'var(--space-xs)',
            }}
          >
            Enter and confirm your new account password below.
          </p>
        </div>

        <Card style={{ padding: 'var(--space-md)' }}>
          {checkingSession ? (
            <div
              className="text-body-sm"
              style={{ color: 'var(--color-secondary)' }}
            >
              Verifying your password reset link...
            </div>
          ) : !hasRecoverySession || linkError ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <div
                className="text-body-sm"
                style={{
                  color: 'var(--color-error)',
                  backgroundColor: '#FCECEC',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {linkError ||
                  'This password reset link is invalid or has expired.'}
              </div>

              <Link
                to="/forgot-password"
                className="ui-btn ui-btn--primary"
                style={{ width: '100%' }}
              >
                Request a new reset link
              </Link>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Link
                  to="/login"
                  className="ui-btn ui-btn--link text-label-md"
                >
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <Input
                id="new-password"
                label="New password (minimum 8 characters)"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              <Input
                id="confirm-password"
                label="Confirm new password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              {formError && (
                <div
                  className="text-body-sm"
                  style={{
                    color: 'var(--color-error)',
                    backgroundColor: '#FCECEC',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {formError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                style={{ width: '100%', marginTop: 'var(--space-xs)' }}
              >
                {submitting ? 'Updating password...' : 'Update password'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

