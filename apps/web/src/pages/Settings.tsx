import React, { useEffect, useState } from "react";
import { Bell, Loader2, Plug, Save, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { api } from "../api.js";
import { ExtensionStatus } from "../components/ExtensionStatus.js";
import { useAuth } from "../components/AuthContext.js";

type SettingsState = Record<string, any>;

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "workspace", label: "Workspace", icon: SlidersHorizontal },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export function Settings() {
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<SettingsState>({});
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      api.getSettings().catch(() => ({ settings: {} })),
      api.listConnections().catch(() => ({ connections: [] })),
    ])
      .then(([settingsResult, connectionsResult]) => {
        if (!active) return;
        setSettings(settingsResult.settings || {});
        setConnections(connectionsResult.connections || []);
      })
      .catch((e: any) => {
        if (active) setError(e.message || "Settings could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateLocalSetting = (key: string, value: any) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await api.updateSettings(settings);
      setSettings(result.settings || settings);
      setSaved(true);
    } catch (e: any) {
      setError(e.message || "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--aw-teal)" }} />
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--aw-coolgray)" }}>
            Opening settings
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 border-b pb-7 md:flex-row md:items-end" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(0,194,212,0.55)" }}>
            Autoworker settings
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--aw-offwhite)", fontFamily: "var(--font-display)" }}>
            Keep the workspace simple.
          </h1>
          <p className="mt-2 max-w-[56ch] text-sm leading-6" style={{ color: "var(--aw-coolgray)" }}>
            Account, workspace, notifications, security, and integrations stay clear and functional here.
          </p>
        </div>
        <button className="aw-btn-primary" onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving" : "Save settings"}
        </button>
      </div>

      {(error || saved) && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: error ? "rgba(214,64,64,0.08)" : "rgba(29,184,122,0.08)",
            border: error ? "1px solid rgba(214,64,64,0.24)" : "1px solid rgba(29,184,122,0.24)",
            color: error ? "var(--aw-red)" : "var(--aw-green)",
          }}
        >
          {error || "Settings saved."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-row gap-2 overflow-auto lg:flex-col">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm"
                style={{ color: "var(--aw-coolgray)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Icon size={14} />
                {section.label}
              </a>
            );
          })}
        </nav>

        <div className="flex flex-col gap-8">
          <section id="account" className="aw-settings-section">
            <div>
              <h2>Account</h2>
              <p>{user?.email || "Signed in with local development access."}</p>
            </div>
            <button className="aw-btn-secondary" onClick={() => signOut()}>
              Sign out
            </button>
          </section>

          <section id="workspace" className="aw-settings-section">
            <div>
              <h2>Workspace</h2>
              <p>Default language for worker-facing explanations.</p>
            </div>
            <label className="aw-setting-control">
              <span>Workspace name</span>
              <input
                className="aw-input"
                value={settings.workspaceName || "Autoworker HQ"}
                onChange={(event) => updateLocalSetting("workspaceName", event.target.value)}
              />
            </label>
          </section>

          <section id="notifications" className="aw-settings-section">
            <div>
              <h2>Notifications</h2>
              <p>Choose when Autoworker should ask for attention.</p>
            </div>
            <label className="aw-toggle-row">
              <input
                type="checkbox"
                checked={settings.notifyNeedsHelp !== false}
                onChange={(event) => updateLocalSetting("notifyNeedsHelp", event.target.checked)}
              />
              <span>Notify me when a worker needs human guidance.</span>
            </label>
            <label className="aw-toggle-row">
              <input
                type="checkbox"
                checked={settings.notifyLearning !== false}
                onChange={(event) => updateLocalSetting("notifyLearning", event.target.checked)}
              />
              <span>Notify me when memory or workflow changes.</span>
            </label>
          </section>

          <section id="security" className="aw-settings-section">
            <div>
              <h2>Security</h2>
              <p>Workers stop when they encounter uncertainty or permission gaps.</p>
            </div>
            <label className="aw-toggle-row">
              <input
                type="checkbox"
                checked={settings.requireHumanApprovalForUncertain !== false}
                onChange={(event) => updateLocalSetting("requireHumanApprovalForUncertain", event.target.checked)}
              />
              <span>Require human approval before uncertain actions.</span>
            </label>
          </section>

          <section id="integrations" className="aw-settings-section">
            <div>
              <h2>Integrations</h2>
              <p>Connected systems and browser access used by workers.</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <ExtensionStatus />
            </div>
            <div className="flex flex-col gap-2">
              {connections.length === 0 ? (
                <div className="text-sm" style={{ color: "var(--aw-coolgray)" }}>
                  No external systems connected yet.
                </div>
              ) : (
                connections.map((connection) => (
                  <div key={connection.id || connection.name} className="flex items-center justify-between border-t py-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--aw-offwhite)" }}>
                        {connection.name || connection.provider || "Connected system"}
                      </div>
                      <div className="text-xs" style={{ color: "var(--aw-coolgray)" }}>
                        {connection.usedFor || "Available to assigned workers"}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--aw-green)" }}>
                      Connected
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
