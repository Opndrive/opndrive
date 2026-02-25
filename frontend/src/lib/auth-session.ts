const LOGIN_KEY = 'opndrive_login_session';

export interface LoginSession {
  provider: 'cognito';
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  loggedInAt: string;
}

export function getLoginSession(): LoginSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawSession = localStorage.getItem(LOGIN_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as LoginSession;
    if (!parsed?.idToken || !parsed?.accessToken || typeof parsed?.expiresAt !== 'number') {
      clearLoginSession();
      return null;
    }

    if (Date.now() >= parsed.expiresAt) {
      clearLoginSession();
      return null;
    }

    return parsed;
  } catch {
    clearLoginSession();
    return null;
  }
}

export function hasValidLoginSession(): boolean {
  return !!getLoginSession();
}

export function saveLoginSession(session: Omit<LoginSession, 'provider' | 'loggedInAt'>): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedSession: LoginSession = {
    provider: 'cognito',
    loggedInAt: new Date().toISOString(),
    ...session,
  };

  localStorage.setItem(LOGIN_KEY, JSON.stringify(normalizedSession));
}

export function clearLoginSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(LOGIN_KEY);
}
