import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, ShieldCheck, Zap, RefreshCw, FileText, ArrowRight, BrainCircuit, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.js';

export function ProductStorySection() {
  const [teamSize, setTeamSize] = useState(8);
  const [hoursPerDay, setHoursPerDay] = useState(3.5);
  const [hourlyWage, setHourlyWage] = useState(45);
  const navigate = useNavigate();
  const { session } = useAuth();

  // ROI Calculations
  const monthlyManualHours = teamSize * hoursPerDay * 21;
  const annualManualHours = monthlyManualHours * 12;
  const annualManualCost = annualManualHours * hourlyWage;
  const squadAnnualCost = 639 * 12; // Operations squad annual
  const netAnnualSavings = Math.max(0, annualManualCost - squadAnnualCost);
  const roiMultiplier = Math.round((netAnnualSavings / squadAnnualCost) * 10) / 10;

  return (
    <section style={{ padding: '100px 48px', background: '#0c0c12', position: 'relative', zIndex: 30, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── SECTION 1: THE PROBLEM WE SOLVE ─────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px', alignItems: 'center', marginBottom: '100px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(232, 148, 42, 0.1)', border: '1px solid rgba(232, 148, 42, 0.25)', borderRadius: '16px', marginBottom: '16px' }}>
              <AlertTriangle size={13} color="#e8942a" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e8942a' }}>
                The Enterprise Bottleneck
              </span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 3.8vw, 3rem)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.1, color: '#f0eeeb', marginBottom: '20px' }}>
              Businesses run on repetitive digital procedures.
            </h2>

            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'rgba(240, 238, 235, 0.65)', lineHeight: 1.65, marginBottom: '24px' }}>
              Knowledge workers spend over 35% of their day manually cross-referencing invoice line items, logging into legacy ERP portals, re-keying customer addresses, and updating inventory status.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { title: 'Siloed Communication', desc: 'Handoffs between Operations, Finance, and Logistics introduce delays and errors.' },
                { title: 'Brittle Traditional RPA', desc: 'Old bots break every time a web portal UI or input selector changes.' },
                { title: 'Drain on High-Value Focus', desc: 'Talented staff are trapped doing copy-paste maintenance rather than strategic work.' }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(232, 148, 42, 0.15)', border: '1px solid rgba(232, 148, 42, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8942a', fontSize: '11px', fontWeight: 700, marginTop: '2px', flexShrink: 0 }}>
                    ✕
                  </div>
                  <div>
                    <strong style={{ color: '#fff', fontSize: '14px' }}>{item.title}</strong>
                    <div style={{ color: 'rgba(240, 238, 235, 0.5)', fontSize: '13px', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Problem Visualization Card */}
          <div style={{ background: 'rgba(18, 18, 26, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '32px', backdropFilter: 'blur(16px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '14px', marginBottom: '20px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#8b949e', textTransform: 'uppercase' }}>Manual Human Procedure Time</span>
              <span style={{ color: '#e8942a', fontSize: '12px', fontWeight: 600 }}>● 3.5 hrs / worker daily</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { task: 'ERP Order Reconciliation', pct: 85, color: '#e8942a' },
                { task: 'Vendor Invoice 3-Way Match', pct: 70, color: '#e8942a' },
                { task: 'Warehouse Stock Rebalancing', pct: 60, color: '#e8942a' },
                { task: 'Routine Customer Exception Handling', pct: 50, color: '#e8942a' }
              ].map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f0eeeb', marginBottom: '6px' }}>
                    <span>{p.task}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: p.color }}>{p.pct}% manual</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', background: p.color, borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: HOW AUTOWORKER SOLVES IT ─────────────── */}
        <div style={{ marginBottom: '100px' }}>
          <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 56px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(0, 194, 212, 0.1)', border: '1px solid rgba(0, 194, 212, 0.25)', borderRadius: '16px', marginBottom: '16px' }}>
              <Cpu size={13} color="#00c2d4" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00c2d4' }}>
                The Architecture
              </span>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 3.8vw, 3rem)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.1, color: '#f0eeeb', marginBottom: '16px' }}>
              How Autoworker operates in your business.
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'rgba(240, 238, 235, 0.55)', lineHeight: 1.6 }}>
              A 4-step continuous lifecycle from standard operating procedures to autonomous execution and human-guided memory adaptation.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {[
              {
                step: '01',
                title: 'Teach with Real Docs',
                desc: 'Upload PDF SOPs, company guidelines, or sample spreadsheets. The worker ingests your exact business knowledge.',
                badge: 'Knowledge Engine',
                icon: <FileText size={18} color="#00c2d4" />
              },
              {
                step: '02',
                title: 'Compile Workflow v1',
                desc: 'Extracts rules, conditions, and actions into deterministic, auditable execution graph sequences.',
                badge: 'Deterministic Graph',
                icon: <BrainCircuit size={18} color="#8b64d4" />
              },
              {
                step: '03',
                title: 'Execute in Live Browser',
                desc: 'Runs in real web portals (Workday, NetSuite, SAP, internal ERPs), clicking buttons and updating databases.',
                badge: 'Playwright Runtime',
                icon: <Zap size={18} color="#1db87a" />
              },
              {
                step: '04',
                title: 'Learn from Guidance (v2)',
                desc: 'When encountering ambiguity, it stops and requests human clarification. Your guidance mutates its memory to v2 permanently.',
                badge: 'Self-Healing Memory',
                icon: <RefreshCw size={18} color="#e8942a" />
              }
            ].map((card, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(18, 18, 26, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '28px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {card.icon}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(240, 238, 235, 0.4)', fontWeight: 700 }}>
                    STEP {card.step}
                  </span>
                </div>

                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                    {card.title}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(240, 238, 235, 0.55)', lineHeight: 1.55 }}>
                    {card.desc}
                  </p>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(240, 238, 235, 0.4)', textTransform: 'uppercase' }}>
                  {card.badge}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 3: INTERACTIVE ROI & SAVINGS CALCULATOR ─── */}
        <div style={{ background: 'linear-gradient(135deg, rgba(20, 26, 38, 0.8), rgba(12, 14, 20, 0.9))', border: '1px solid rgba(0, 194, 212, 0.3)', borderRadius: '20px', padding: '48px', backdropFilter: 'blur(20px)', marginBottom: '80px', boxShadow: '0 20px 60px rgba(0, 194, 212, 0.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px', alignItems: 'center' }}>
            
            {/* Left Controls */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'rgba(29, 184, 122, 0.1)', border: '1px solid rgba(29, 184, 122, 0.25)', borderRadius: '16px', marginBottom: '14px' }}>
                <TrendingUp size={13} color="#1db87a" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1db87a' }}>
                  Interactive ROI Calculator
                </span>
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
                Calculate your workforce time & cost savings.
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(240, 238, 235, 0.6)', lineHeight: 1.55, marginBottom: '28px' }}>
                Adjust team parameters to model the operational return on deploying digital autoworkers.
              </p>

              {/* Slider 1: Team Size */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f0eeeb', marginBottom: '8px' }}>
                  <span>Team Members in Operations/Finance</span>
                  <strong style={{ color: '#00c2d4' }}>{teamSize} people</strong>
                </div>
                <input
                  type="range"
                  min="2"
                  max="50"
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#00c2d4', cursor: 'pointer' }}
                />
              </div>

              {/* Slider 2: Hours/Day */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f0eeeb', marginBottom: '8px' }}>
                  <span>Hours spent daily on repetitive procedures</span>
                  <strong style={{ color: '#00c2d4' }}>{hoursPerDay} hrs / person</strong>
                </div>
                <input
                  type="range"
                  min="1"
                  max="7"
                  step="0.5"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#00c2d4', cursor: 'pointer' }}
                />
              </div>

              {/* Slider 3: Hourly Wage */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f0eeeb', marginBottom: '8px' }}>
                  <span>Average Loaded Hourly Cost</span>
                  <strong style={{ color: '#00c2d4' }}>${hourlyWage} / hr</strong>
                </div>
                <input
                  type="range"
                  min="25"
                  max="120"
                  value={hourlyWage}
                  onChange={(e) => setHourlyWage(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#00c2d4', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Right ROI Metrics Card */}
            <div style={{ background: 'rgba(10, 12, 18, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(240, 238, 235, 0.45)', textTransform: 'uppercase' }}>
                  Projected Annual Hours Saved
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 800, color: '#00c2d4', letterSpacing: '-0.02em', marginTop: '4px' }}>
                  {annualManualHours.toLocaleString()} hrs
                </div>
                <div style={{ fontSize: '12px', color: '#1db87a', marginTop: '2px' }}>
                  ✓ Equal to {Math.round(annualManualHours / 2080 * 10) / 10} full-time equivalent output
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(240, 238, 235, 0.45)', textTransform: 'uppercase' }}>
                  Net Projected Annual Cost Savings
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 800, color: '#1db87a', letterSpacing: '-0.02em', marginTop: '4px' }}>
                  ${netAnnualSavings.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(240, 238, 235, 0.6)', marginTop: '2px' }}>
                  After deducting Autoworker Squad subscription (${squadAnnualCost.toLocaleString()}/yr)
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 194, 212, 0.08)', border: '1px solid rgba(0, 194, 212, 0.2)', padding: '12px 16px', borderRadius: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Estimated Return on Investment</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#00c2d4' }}>
                  {roiMultiplier}x ROI
                </span>
              </div>

              <button
                onClick={() => {
                  if (session) navigate('/workforce');
                  else navigate('/register');
                }}
                className="aw-btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '13px' }}
              >
                Deploy your digital workforce <ArrowRight size={14} />
              </button>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
