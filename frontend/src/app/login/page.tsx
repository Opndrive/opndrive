'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { hasValidLoginSession } from '@/lib/auth-session';
import {
  createCodeChallenge,
  generateRandomString,
  normalizeCognitoDomain,
  resolveCognitoRedirectUri,
  saveOauthState,
  savePkceVerifier,
} from '@/lib/cognito-auth';

export default function LoginPage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');

  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '';
  const cognitoClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '';
  const cognitoRedirectUri = resolveCognitoRedirectUri(
    process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ?? ''
  );
  const cognitoLoginUrl = process.env.NEXT_PUBLIC_COGNITO_LOGIN_URL ?? '';
  // Use authorization code flow by default because many Cognito app clients disable
  // the implicit flow (`token`) in production.
  const cognitoResponseType = process.env.NEXT_PUBLIC_COGNITO_RESPONSE_TYPE ?? 'code';
  const cognitoScope = process.env.NEXT_PUBLIC_COGNITO_SCOPE ?? 'openid email profile';

  const isConfigured = Boolean(
    cognitoLoginUrl || (cognitoDomain && cognitoClientId && cognitoRedirectUri)
  );
  const isCodeFlow = cognitoResponseType === 'code';

  const baseLoginUrl = useMemo(() => {
    if (!isConfigured) {
      return null;
    }

    const url = cognitoLoginUrl
      ? new URL(cognitoLoginUrl)
      : new URL('/oauth2/authorize', normalizeCognitoDomain(cognitoDomain));

    if (!cognitoLoginUrl) {
      url.searchParams.set('client_id', cognitoClientId);
      url.searchParams.set('response_type', cognitoResponseType);
      url.searchParams.set('scope', cognitoScope);
      url.searchParams.set('redirect_uri', cognitoRedirectUri);
    }

    return url;
  }, [
    cognitoLoginUrl,
    cognitoDomain,
    cognitoClientId,
    cognitoRedirectUri,
    cognitoResponseType,
    cognitoScope,
    isConfigured,
  ]);

  const startLogin = async () => {
    if (!isConfigured || !baseLoginUrl) {
      return;
    }

    setIsRedirecting(true);
    setError('');

    try {
      const loginUrl = new URL(baseLoginUrl.toString());
      const state = generateRandomString(32);
      saveOauthState(state);
      loginUrl.searchParams.set('state', state);

      if (isCodeFlow) {
        const verifier = generateRandomString(96);
        const challenge = await createCodeChallenge(verifier);
        savePkceVerifier(verifier);
        loginUrl.searchParams.set('code_challenge_method', 'S256');
        loginUrl.searchParams.set('code_challenge', challenge);
      }

      window.location.href = loginUrl.toString();
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'Failed to start Cognito sign-in.'
      );
      setIsRedirecting(false);
    }
  };

  useEffect(() => {
    if (hasValidLoginSession()) {
      router.push('/connect');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 md:py-16">
        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">Sign in with AWS Cognito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your own Cognito Hosted UI, then return to Opndrive to connect your S3-compatible
            storage.
          </p>

          {!isConfigured && (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Configure <code>NEXT_PUBLIC_COGNITO_DOMAIN</code>,{' '}
              <code>NEXT_PUBLIC_COGNITO_CLIENT_ID</code>, and{' '}
              <code>NEXT_PUBLIC_COGNITO_REDIRECT_URI</code> to enable login, or set{' '}
              <code>NEXT_PUBLIC_COGNITO_LOGIN_URL</code> to use a full Hosted UI login URL.
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <Button
            type="button"
            className="mt-6 w-full"
            disabled={!isConfigured || isRedirecting}
            onClick={startLogin}
          >
            {isRedirecting ? 'Redirecting…' : 'Continue with Cognito'}
            {!isRedirecting && <ExternalLink className="ml-2 h-4 w-4" />}
          </Button>

          <p className="mt-3 text-xs text-muted-foreground">
            Using {cognitoLoginUrl ? <code>NEXT_PUBLIC_COGNITO_LOGIN_URL</code> : 'generated'}{' '}
            Cognito login URL.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Current OAuth response type: <code>{cognitoResponseType}</code>
            {isCodeFlow ? ' (PKCE enabled)' : ''}
          </p>
        </div>
      </main>
    </div>
  );
}
