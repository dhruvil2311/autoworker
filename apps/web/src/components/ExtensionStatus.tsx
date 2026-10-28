import React, { useEffect, useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "./AuthContext.js";

export function ExtensionStatus() {
  const [connected, setConnected] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "GHOST_EXTENSION_CONNECTED") {
        setConnected(true);
      }
    };

    window.addEventListener("message", handleMessage);
    window.postMessage({ type: "GHOST_EXTENSION_PING" }, "*");

    const checkTimer = window.setTimeout(() => {
      window.postMessage({ type: "GHOST_EXTENSION_PING" }, "*");
    }, 1000);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(checkTimer);
    };
  }, []);

  useEffect(() => {
    const token = session ? `Bearer ${session.access_token}` : api.getTokenValue();
    if (!token) return;

    window.postMessage(
      {
        type: "GHOST_EXTENSION_HANDSHAKE",
        payload: { apiUrl: api.getApiUrl(), token },
      },
      "*",
    );
  }, [session]);

  const connectExtension = () => {
    window.postMessage(
      {
        type: "GHOST_EXTENSION_HANDSHAKE",
        payload: {
          apiUrl: api.getApiUrl(),
          token: session ? `Bearer ${session.access_token}` : api.getTokenValue(),
        },
      },
      "*",
    );
  };

  return (
    <div className="flex items-center gap-3">
      {connected ? (
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--aw-green)" }}>
          <Link2 size={14} />
          Browser connected
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--aw-coolgray)" }}>
            <Link2Off size={14} />
            Browser waiting
          </div>
          <button
            type="button"
            onClick={connectExtension}
            className="aw-btn-ghost"
            style={{ padding: "6px 10px", fontSize: 10 }}
          >
            Connect
          </button>
        </>
      )}
    </div>
  );
}
