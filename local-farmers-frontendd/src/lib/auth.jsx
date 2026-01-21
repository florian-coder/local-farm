import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiFetch } from './api.js';

const AuthContext = createContext({
  status: 'loading',
  user: null,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const response = await apiFetch('/api/auth/me', { method: 'GET' });
      if (!response.ok) {
        setState({ status: 'guest', user: null });
        return null;
      }
      const data = await response.json();
      if (!data?.id) {
        setState({ status: 'guest', user: null });
        return null;
      }
      setState({ status: 'authenticated', user: data });
      return data;
    } catch (error) {
      setState({ status: 'guest', user: null });
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Ignore network errors during logout.
    }
    setState({ status: 'guest', user: null });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ ...state, refresh, logout }),
    [state, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
