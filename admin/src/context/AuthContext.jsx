import { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    return localStorage.getItem('dv_token');
  });

  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('dv_admin');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (session) => {
    localStorage.setItem('dv_token', session.token);
    localStorage.setItem('dv_admin', JSON.stringify(session.admin));

    setToken(session.token);
    setAdmin(session.admin);
  };

  const logout = () => {
    localStorage.removeItem('dv_token');
    localStorage.removeItem('dv_admin');

    setToken(null);
    setAdmin(null);
  };

  const value = useMemo(
    () => ({
      token,
      admin,
      login,
      logout,
      isAuthenticated: !!token
    }),
    [token, admin]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}