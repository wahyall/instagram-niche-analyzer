'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Session {
  valid: boolean;
  username?: string;
  sessionId?: string;
}

export function useSession(requireAuth: boolean = false) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      setSession(data);
      
      if (requireAuth && !data.valid) {
        router.push('/');
      }
    } catch (error) {
      setSession({ valid: false });
      if (requireAuth) {
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  }, [requireAuth, router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSession({ valid: false });
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const refreshSession = () => {
    setLoading(true);
    checkSession();
  };

  return {
    session,
    loading,
    isAuthenticated: session?.valid ?? false,
    username: session?.username,
    logout,
    refreshSession,
  };
}

