import React, { createContext, useContext, useEffect, useState } from "react";
import { getMe, loginRequest, signupRequest, logoutRequest } from "@/services/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` here means "we haven't heard back from /auth/me yet" — distinct
  // from any individual form's isSubmitting. ProtectedRoute waits on this.
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    try {
      const me = await getMe();
      setUser(me || null);
    } catch {
      // No valid session — this is an expected state for a logged-out
      // visitor, not an error worth surfacing.
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (credentials) => {
    const data = await loginRequest(credentials);
    setUser(data?.user ?? data);
    return data;
  };

  const signup = async (payload) => {
    const data = await signupRequest(payload);
    setUser(data?.user ?? data);
    return data;
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh: loadSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>.");
  return ctx;
}
