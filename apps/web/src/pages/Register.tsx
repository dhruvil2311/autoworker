import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../components/AuthContext.js";
import { Loader2, CheckCircle2 } from "lucide-react";

export function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!supabase) {
      setError(
        "Self-signup isn't configured for this environment. Use the sign-in page with the demo account."
      );
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name || undefined } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      navigate("/workforce");
      return;
    }

    setAwaitingConfirmation(true);
    setLoading(false);
  };

  const pageStyles: React.CSSProperties = {
    display: 'grid', placeItems: 'center', minHeight: '100vh',
    background: 'var(--aw-obsidian)', padding: 24, position: 'relative',
  };

  const cardStyles: React.CSSProperties = {
    position: 'relative', zIndex: 1,
    width: '100%', maxWidth: 420,
    background: 'var(--aw-graphite)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 32,
    boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
  };

  if (awaitingConfirmation) {
    return (
      <div style={pageStyles}>
        <div style={{ ...cardStyles, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, background: 'rgba(29,184,122,0.1)', border: '1px solid rgba(29,184,122,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle2 size={24} color="var(--aw-green)" />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--aw-offwhite)', marginBottom: 8 }}>
            Check your inbox
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(180,178,190,0.5)', lineHeight: 1.65, marginBottom: 28 }}>
            We sent a confirmation link to{' '}
            <strong style={{ color: 'rgba(240,238,235,0.8)', fontWeight: 600 }}>{email}</strong>.
            Confirm your email, then sign in to start teaching your first worker.
          </p>
          <Link to="/login" className="aw-btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', padding: '13px' }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles}>
      {/* Ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,194,212,0.03), transparent 60%)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,100,212,0.025), transparent 60%)' }} />
      </div>

      <div style={cardStyles}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 11, background: 'rgba(0,194,212,0.08)', border: '1px solid rgba(0,194,212,0.18)', color: 'var(--aw-teal)', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 18, textDecoration: 'none' }}>
            A
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--aw-offwhite)', marginBottom: 6 }}>
            Hire your first worker
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(180,178,190,0.45)' }}>
            Start teaching it your business process in minutes.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(214,64,64,0.08)', border: '1px solid rgba(214,64,64,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 22, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--aw-red)', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="aw-form-group">
            <label className="aw-form-label">Full name</label>
            <input
              type="text"
              className="aw-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </div>
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
          <div className="aw-form-group">
            <label className="aw-form-label">Password</label>
            <input
              type="password"
              className="aw-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="aw-form-group" style={{ marginBottom: 28 }}>
            <label className="aw-form-label">Confirm password</label>
            <input
              type="password"
              className="aw-input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="aw-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
            disabled={loading}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Creating your account...</> : 'Hire your first worker'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 22, fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(180,178,190,0.35)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--aw-teal)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
