import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getMe, loginRequest, signupRequest, logoutRequest } from "@/services/auth";
import { publishAuthEvent, subscribeToAuthEvents } from "@/utils/authEvents";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` here means "we haven't heard back from /auth/me yet" — distinct
  // from any individual form's isSubmitting. ProtectedRoute waits on this.
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(
    () =>
      subscribeToAuthEvents((event) => {
        if (event.type === "logout") {
          setUser(null);
          setLoading(false);
        } else if (event.type === "login") {
          loadSession();
        }
      }),
    [loadSession]
  );

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") loadSession();
    };

    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);

    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [loadSession]);

  const login = async (credentials) => {
    const data = await loginRequest(credentials);
    setUser(data?.user ?? data);
    publishAuthEvent("login");
    return data;
  };

  const signup = async (payload) => {
    // Account creation does not establish a session; the user signs in next.
    return signupRequest(payload);
  };

  const logout = async () => {
    await logoutRequest();
    setUser(null);
    publishAuthEvent("logout");
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
