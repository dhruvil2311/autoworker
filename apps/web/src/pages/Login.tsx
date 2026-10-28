import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../components/AuthContext.js";
import { api } from "../api.js";
import { Loader2 } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("admin@ghost.local");
  const [password, setPassword] = useState("Ghost@123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    typeof window !== 'undefined' && window.location.search.includes('expired=true')
      ? 'Your session expired. Please sign in again.'
      : ''
  );
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!supabase) {
      try {
        const result = await api.devLogin(email, password);
        if (result.token) {
          api.setToken(`dev:${result.token}`);
          window.location.href = "/workforce";
          return;
        }
      } catch (err: any) {
        setError(err.message || "Login failed");
        setLoading(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
      } else {
        navigate("/workforce");
      }
    }
  };

  return (
    <div style={{
      display: 'grid', placeItems: 'center', minHeight: '100vh',
      background: 'var(--aw-obsidian)', padding: 24,
    }}>
      {/* Ambient background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,194,212,0.03) 0%, transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-5%', width: '40vw', height: '40vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,100,212,0.03) 0%, transparent 60%)',
        }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400,
        background: 'var(--aw-graphite)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: 32,
        boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Logo + heading */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 11, background: 'rgba(0,194,212,0.08)', border: '1px solid rgba(0,194,212,0.18)', color: 'var(--aw-teal)', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 18, textDecoration: 'none' }}>
            A
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--aw-offwhite)', marginBottom: 6 }}>
            Sign in to Autoworker
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(180,178,190,0.45)' }}>
            Welcome back to your workforce
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(214,64,64,0.08)', border: '1px solid rgba(214,64,64,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 22, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--aw-red)', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="aw-form-group">
            <label className="aw-form-label">Email address</label>
            <input
              type="email"
              className="aw-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="aw-form-group" style={{ marginBottom: 28 }}>
            <label className="aw-form-label">Password</label>
            <input
              type="password"
              className="aw-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="aw-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
            disabled={loading}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Signing in...</> : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 22, fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(180,178,190,0.35)' }}>
          No account?{' '}
          <Link to="/register" style={{ color: 'var(--aw-teal)', fontWeight: 600, textDecoration: 'none' }}>
            Hire your first worker
          </Link>
        </p>
      </div>
    </div>
  );
}
