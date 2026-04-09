import { createContext, useContext, useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

type AuthState = {
  isAuthenticated: boolean;
  isGuest: boolean;
  login: () => void;
  loginAsGuest: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useLocalStorage("autoscribe_auth", false);
  const [isGuest, setIsGuest] = useLocalStorage("autoscribe_guest", false);

  const login = () => {
    setIsAuth(true);
    setIsGuest(false);
  };

  const loginAsGuest = () => {
    setIsAuth(true);
    setIsGuest(true);
  };

  const logout = () => {
    setIsAuth(false);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: isAuth, isGuest, login, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
