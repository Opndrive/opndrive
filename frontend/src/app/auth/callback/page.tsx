'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { saveLoginSession } from '@/lib/auth-session';
import {
  consumeOauthState,
  consumePkceVerifier,
  exchangeCodeForTokens,
  getDefaultCognitoRedirectUri,
  resolveCognitoRedirectUri,
} from '@/lib/cognito-auth';

type CallbackStatus = 'processing' | 'error';

function parseOauthParams(): URLSearchParams {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  const merged = new URLSearchParams(hashParams);

  queryParams.forEach((value, key) => {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  });

  return merged;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  const supportMessage = useMemo(
    () =>
      'Please verify your Cognito App Client callback URL, OAuth response type, and domain settings.',
    []
  );

  useEffect(() => {
    const completeSignIn = async () => {
      const params = parseOauthParams();

      const oauthError = params.get('error_description') || params.get('error');
      if (oauthError) {
        setStatus('error');
        setErrorMessage(oauthError);
        return;
      }

      const stateFromProvider = params.get('state');
      const expectedState = consumeOauthState();
      if (!stateFromProvider || !expectedState || stateFromProvider !== expectedState) {
        setStatus('error');
        setErrorMessage('OAuth state validation failed. Please try signing in again.');
        return;
      }

      let idToken = params.get('id_token');
      let accessToken = params.get('access_token');
      let refreshToken = params.get('refresh_token') ?? undefined;
      let expiresIn = Number(params.get('expires_in') || 3600);

      const authorizationCode = params.get('code');
      if (authorizationCode && (!idToken || !accessToken)) {
        const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '';
        const cognitoClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '';
        const configuredRedirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ?? '';
        const cognitoRedirectUri = resolveCognitoRedirectUri(
          configuredRedirectUri || getDefaultCognitoRedirectUri()
        );

        if (!cognitoDomain || !cognitoClientId || !cognitoRedirectUri) {
          setStatus('error');
          setErrorMessage('Missing Cognito configuration for authorization code exchange.');
          return;
        }

        const codeVerifier = consumePkceVerifier();
        if (!codeVerifier) {
          setStatus('error');
          setErrorMessage('Missing PKCE verifier. Please restart the sign-in flow.');
          return;
        }

        try {
          const tokenResponse = await exchangeCodeForTokens(
            {
              domain: cognitoDomain,
              clientId: cognitoClientId,
              redirectUri: cognitoRedirectUri,
              responseType: 'code',
              scope: process.env.NEXT_PUBLIC_COGNITO_SCOPE ?? 'openid email profile',
            },
            authorizationCode,
            codeVerifier
          );
          idToken = tokenResponse.id_token;
          accessToken = tokenResponse.access_token;
          refreshToken = tokenResponse.refresh_token;
          expiresIn = Number(tokenResponse.expires_in || 3600);
        } catch (error) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : 'Token exchange failed.');
          return;
        }
      }

      if (!idToken || !accessToken || Number.isNaN(expiresIn)) {
        setStatus('error');
        setErrorMessage('Missing required OAuth tokens from Cognito callback.');
        return;
      }

      saveLoginSession({
        idToken,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
      });

      router.push('/connect');
    };

    completeSignIn();
  }, [router]);

  if (status === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Completing sign-in…</p>
      </div>
    );
  }

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
          <h1 className="text-xl font-semibold text-foreground">
            Could not complete Cognito login
          </h1>
          <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
          <p className="mt-2 text-xs text-muted-foreground">{supportMessage}</p>

          <Button type="button" className="mt-6 w-full" onClick={() => router.push('/login')}>
            Try sign-in again
          </Button>
        </div>
      </main>
    </div>
  );
}
