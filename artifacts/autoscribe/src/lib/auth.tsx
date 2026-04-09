import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  createdAt: string;
}

type AuthState = {
  isAuthenticated: boolean;
  isGuest: boolean;
  user: UserProfile | null;
  guestSessionId: string | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (fullName: string, email: string, password: string) => Promise<{ error?: string }>;
  loginAsGuest: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function getBaseApiUrl(): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

function getOrCreateGuestId(): string {
  const key = "autoscribe_guest_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "guest_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("autoscribe_token"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const u = localStorage.getItem("autoscribe_user");
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });
  const [isGuest, setIsGuest] = useState<boolean>(() => localStorage.getItem("autoscribe_is_guest") === "true");
  const [guestSessionId] = useState<string>(() => getOrCreateGuestId());

  useEffect(() => {
    setAuthTokenGetter(() => token ?? undefined);
  }, [token]);

  const persistLogin = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem("autoscribe_token", newToken);
    localStorage.setItem("autoscribe_user", JSON.stringify(newUser));
    localStorage.removeItem("autoscribe_is_guest");
    setToken(newToken);
    setUser(newUser);
    setIsGuest(false);
  };

  const login = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch(`${getBaseApiUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Login failed" };
      persistLogin(data.token, data.user);
      return {};
    } catch {
      return { error: "Network error. Please try again." };
    }
  }, []);

  const signup = useCallback(async (fullName: string, email: string, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch(`${getBaseApiUrl()}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Signup failed" };
      persistLogin(data.token, data.user);
      return {};
    } catch {
      return { error: "Network error. Please try again." };
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    localStorage.setItem("autoscribe_is_guest", "true");
    localStorage.removeItem("autoscribe_token");
    localStorage.removeItem("autoscribe_user");
    setToken(null);
    setUser(null);
    setIsGuest(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("autoscribe_token");
    localStorage.removeItem("autoscribe_user");
    localStorage.removeItem("autoscribe_is_guest");
    setToken(null);
    setUser(null);
    setIsGuest(false);
  }, []);

  const isAuthenticated = !!token || isGuest;

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isGuest,
      user,
      guestSessionId,
      token,
      login,
      signup,
      loginAsGuest,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
