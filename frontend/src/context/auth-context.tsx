'use client';

import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { SignInWithPasswordCredentials } from '@supabase/supabase-js';
import type { Role, User } from '@/types/user';
import type { AuthContextType } from '@/types/auth';
import type { NotificationContextType } from './notification-context';
import { isProtectedPath, isPublicPath } from '@/lib/route-config';

// default context
export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {
    throw new Error('AuthContext not initialised');
  },
  signup: async () => {
    throw new Error('AuthContext not initialised');
  },
  logout: () => {
    throw new Error('AuthContext not initialised');
  },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoad] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // session check on hard refresh
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setUser(null);
        setLoad(false);
        if (isProtectedPath(pathname)) router.replace('/');
        return;
      }
      const u = data.session.user;
      if (!u.email) {
        setLoad(false);
        return;
      }

      setUser({ id: u.id, email: u.email, role: (u.role ?? 'user') as Role });
      setLoad(false);
    })();
  }, [pathname, router]);

  // email / password login
  const login = async (email: string, password: string, n: NotificationContextType) => {
    const creds: SignInWithPasswordCredentials = { email, password };
    const { data, error } = await supabase.auth.signInWithPassword(creds);
    if (error || !data.user.id || !data.user.email) throw new Error('invalid_credentials');

    const logged: User = {
      id: data.user.id,
      email: data.user.email,
      role: (data.user.role ?? 'user') as Role,
    };
    setUser(logged);
    n.success('Login successful');
    return logged;
  };

  // email / password signup
  const signup = async (
    {
      firstName,
      lastName,
      email,
      password,
    }: { firstName: string; lastName: string; email: string; password: string },
    n: NotificationContextType
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { firstName, lastName } },
    });
    if (error) throw error;
    n.success('Signup successful – verify email.');
  };

  // sign out
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setLoad(false);
    if (isProtectedPath(pathname) && !isPublicPath(pathname)) router.replace('/');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
