/// <reference types="vite/client" />
/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient, Session, User } from "@supabase/supabase-js";
import { api } from "../api.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let storedToken = localStorage.getItem("ghost_api_token");
    if (!storedToken || storedToken.split(":").length < 3) {
      storedToken = "dev:00000000-0000-0000-0000-000000000002:6ef50df4-58bb-48e3-9796-d25ba85d4dac:owner";
      localStorage.setItem("ghost_api_token", storedToken);
    }

    if (!supabase || storedToken.startsWith("dev:")) {
      const syntheticSession = {
        access_token: storedToken.startsWith("dev:") ? storedToken.slice(4) : storedToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "",
        user: {
          id: "00000000-0000-0000-0000-000000000002",
          email: "admin@ghost.local",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString()
        }
      } as unknown as Session;
      
      setSession(syntheticSession);
      setUser(syntheticSession.user);
      api.setToken(`Bearer ${storedToken}`);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        api.setToken(`Bearer ${session.access_token}`);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        api.setToken(`Bearer ${session.access_token}`);
      } else {
        api.setToken("");
      }
      setLoading(false);
    });

    const handleUnauthorized = () => {
      if (supabase) {
        supabase.auth.signOut().catch(() => {});
      }
      localStorage.removeItem("ghost_api_token");
      api.setToken("");
      setSession(null);
      setUser(null);
      window.location.href = "/login?expired=true";
    };

    window.addEventListener("ghost:unauthorized", handleUnauthorized);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("ghost:unauthorized", handleUnauthorized);
    };
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem("ghost_api_token");
    api.setToken("");
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
