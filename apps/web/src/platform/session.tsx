import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MeResponse, Experience } from "@ghost/shared-types/contracts";
import { platformApi } from "./api/resources.js";
import { ApiError, currentToken, friendlyError } from "./api/client.js";

interface Session {
  me: MeResponse | null;
  error: string | null;
  loading: boolean;
  can: (permission: string) => boolean;
  hasExperience: (experience: Experience) => boolean;
  reload: () => void;
}

const SessionContext = createContext<Session>({
  me: null, error: null, loading: true, can: () => false, hasExperience: () => false, reload: () => {}
});

/** Loads the caller's identity, role and permitted experiences from the server (never from the token). */
export function PlatformSessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    platformApi.me()
      .then(r => { if (!cancelled) { setMe(r); setError(null); } })
      .catch(err => { if (!cancelled) { setMe(null); setError(err instanceof ApiError && err.status === 401 ? "Your session has expired. Sign in again." : friendlyError(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  const can = useCallback((p: string) => Boolean(me?.permissions.includes(p)), [me]);
  const hasExperience = useCallback((e: Experience) => Boolean(me?.experiences.includes(e)), [me]);
  const reload = useCallback(() => setVersion(v => v + 1), []);

  return <SessionContext.Provider value={{ me, error, loading, can, hasExperience, reload }}>{children}</SessionContext.Provider>;
}

export const usePlatformSession = () => useContext(SessionContext);

/** Development sign-in only: development tokens carry a role the server validates. */
export function devTokenRole(): string | null {
  const token = currentToken();
  if (!token || !token.startsWith("dev:")) return null;
  return token.split(":")[3] || "owner";
}

export function setDevTokenRole(role: string) {
  const token = currentToken();
  if (!token || !token.startsWith("dev:")) return;
  const [, user, tenant] = token.split(":");
  localStorage.setItem("ghost_api_token", `dev:${user}:${tenant}:${role}`);
}
