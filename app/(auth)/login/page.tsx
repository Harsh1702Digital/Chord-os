'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const error = params.get('error');

  async function signIn() {
    setLoading(true);
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: {
        redirectTo: `${origin}/api/auth/callback`,
        scopes: 'openid email profile',
      },
    });
  }

  return (
    <div className="w-full max-w-md bg-[var(--paper)] border border-[var(--line)] rounded-2xl p-10 shadow-[8px_8px_0_var(--ink)]">
      <h1 className="font-display text-5xl uppercase tracking-tight mb-2">Harmony</h1>
      <p className="text-sm text-[var(--gray)] mb-8">
        Internal workspace for <strong>1702 Digital + Chord</strong>.<br />
        Sign in with your <strong>edernityteam</strong> Slack account.
      </p>

      {error === 'unauthorized' && (
        <div className="mb-6 p-3 border rounded text-sm" style={{ background: 'rgba(255,59,47,0.08)', borderColor: 'var(--red)', color: 'var(--red)' }}>
          Not authorized. You must be a member of the edernityteam Slack workspace.
        </div>
      )}

      <button
        onClick={signIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 uppercase tracking-[0.12em] text-sm font-mono py-4 rounded-full hover:opacity-90 disabled:opacity-50 transition"
        style={{ background: 'var(--ink)', color: 'var(--cream)' }}
      >
        {!loading && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
          </svg>
        )}
        {loading ? 'Redirecting…' : 'Sign in with Slack'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray)' }}>or</p>
        <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
      </div>

      <a
        href="/client/login"
        className="w-full flex items-center justify-center uppercase tracking-[0.12em] text-sm font-mono py-4 rounded-full transition hover:opacity-80"
        style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ink)', textDecoration: 'none' }}
      >
        Client Portal Login
      </a>

    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[var(--cream)]">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
