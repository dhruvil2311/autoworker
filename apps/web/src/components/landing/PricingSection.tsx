import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, ArrowRight, ShieldCheck, Zap, Server, Users, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthContext.js';

interface Plan {
  id: string;
  name: string;
  badge?: string;
  highlight?: boolean;
  priceMonthly: number;
  priceAnnual: number;
  description: string;
  workforceCapacity: string;
  features: string[];
  ctaText: string;
  ctaAction: string;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter Worker',
    priceMonthly: 299,
    priceAnnual: 239,
    description: 'Perfect for single department automation and eliminating repetitive tasks.',
    workforceCapacity: '1 Dedicated Digital Worker',
    features: [
      '1 Dedicated Virtual Workstation',
      'Up to 1,500 Task Runs / month',
      'Teach via PDF SOPs & spreadsheets',
      'Deterministic workflow synthesis (v1)',
      'Standard web browser RPA engine',
      'Email alerts on uncertainty',
      'Community & email support (24h SLA)',
    ],
    ctaText: 'Hire Starter Worker',
    ctaAction: '/register',
  },
  {
    id: 'squad',
    name: 'Operations Squad',
    badge: 'MOST POPULAR',
    highlight: true,
    priceMonthly: 799,
    priceAnnual: 639,
    description: 'Autonomous squad running cross-department workflows across Ops, Finance & Logistics.',
    workforceCapacity: '3 Dedicated Digital Workers',
    features: [
      '3 Dedicated Virtual Workstations (Ops/Fin/Logistics)',
      'Up to 10,000 Task Runs / month',
      'Self-healing memory & workflow evolution (v2)',
      'Live browser streaming & real-time telemetry',
      'Human-in-the-loop live guidance takeover',
      'Chrome Extension Live Assistant integration',
      'Multi-tenant enterprise access control',
      'Priority support (4h SLA) + Onboarding engineer',
    ],
    ctaText: 'Deploy Operations Squad',
    ctaAction: '/register',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Workforce',
    badge: 'FLEET SCALE',
    priceMonthly: 1999,
    priceAnnual: 1599,
    description: 'Scale an entire digital workforce with custom ERP integrations and compliance.',
    workforceCapacity: '10 Dedicated Digital Workers',
    features: [
      '10 Dedicated High-Performance Workstations',
      'Unlimited Task Executions',
      'Custom ERP/CRM internal connectors',
      'Dedicated private server core cluster',
      'Autonomous exception resolution matrix',
      'SOC2 Type II & HIPAA compliance bundle',
      'Custom role-based access & SSO (SAML/Okta)',
      'Dedicated Solutions Architect & 1h SLA',
    ],
    ctaText: 'Deploy Enterprise Fleet',
    ctaAction: '/register',
  },
  {
    id: 'autonomous-fleet',
    name: 'Autonomous Fleet',
    priceMonthly: 4999,
    priceAnnual: 3999,
    description: 'Custom on-premise or dedicated cloud deployment for Fortune 500 operations.',
    workforceCapacity: 'Unlimited Digital Workers',
    features: [
      'Unlimited Digital Worker Workstations',
      'VPC or On-Premises private deployment',
      'Custom fine-tuned vision & reasoning models',
      'Direct database & mainframe legacy connectors',
      'Full audit logs & real-time telemetry export',
      '24/7 dedicated mission control engineering team',
      'Custom legal & data sovereignty agreements',
    ],
    ctaText: 'Contact Enterprise Sales',
    ctaAction: '/register',
  },
];

const FAQS = [
  {
    q: 'How does an Autoworker differ from traditional RPA bots or AI scripts?',
    a: 'Traditional RPA relies on fragile brittle selectors that break whenever a button moves or a UI updates. Autoworker understands your business rules from SOPs, compiles deterministic execution pathways in live browsers, stops and asks for human guidance when encountering unexpected situations, and encodes that correction permanently into its long-term memory (mutating from v1 to v2).'
  },
  {
    q: 'Do I need developers to teach an Autoworker my process?',
    a: 'No. You teach an Autoworker just like you would onboard a human hire: upload your standard operating procedures (SOPs), spreadsheets, documentation, or walk through the process with our Chrome Extension. Autoworker extracts rules, conditions, and actions into a verifiable workflow.'
  },
  {
    q: 'What happens when an Autoworker encounters an edge case or error?',
    a: 'Unlike traditional bots that fail silently or corrupt data, Autoworker safely pauses at the exact step, highlights what it expected versus what it found, and notifies your team. When you provide the correction ("Click More Actions first"), it updates its workflow immediately and remembers for all future runs.'
  },
  {
    q: 'Can I switch between monthly and annual billing at any time?',
    a: 'Yes. Annual billing gives you a 20% discount on all plans. You can upgrade, downgrade, or add additional worker workstations directly from your Headquarter dashboard.'
  },
  {
    q: 'Is our enterprise data safe and isolated?',
    a: 'Every subscriber tenant runs in isolated sandboxes with strict database row-level security (RLS), encrypted secrets, and private browser runtimes. We do not use your proprietary business data to train public foundation models.'
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navigate = useNavigate();
  const { session } = useAuth();

  const handleCta = (action: string) => {
    if (session) {
      navigate('/workforce');
    } else {
      navigate(action);
    }
  };

  return (
    <section id="pricing" style={{ padding: '120px 48px 80px', background: '#0a0a0f', position: 'relative', zIndex: 30 }}>
      {/* Background radial glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '1000px',
        height: '500px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0, 194, 212, 0.08), transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'rgba(0, 194, 212, 0.08)', border: '1px solid rgba(0, 194, 212, 0.2)', borderRadius: '20px', marginBottom: '16px' }}>
            <Sparkles size={13} color="#00c2d4" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00c2d4' }}>
              Transparent Workforce Pricing
            </span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#f0eeeb', marginBottom: '18px' }}>
            Hire digital capacity.<br />
            <span style={{ fontWeight: 300, fontStyle: 'italic', color: 'rgba(240, 238, 235, 0.65)' }}>Scale your business without overhead.</span>
          </h2>

          <p style={{ fontFamily: 'var(--font-body)', fontSize: '16px', color: 'rgba(240, 238, 235, 0.55)', maxWidth: '58ch', margin: '0 auto 36px', lineHeight: 1.6 }}>
            Every plan includes dedicated virtual workstations, self-healing memory, deterministic browser execution, and instant human handoff.
          </p>

          {/* Monthly / Annual Billing Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '30px', padding: '4px', gap: '4px' }}>
            <button
              onClick={() => setIsAnnual(false)}
              style={{
                padding: '8px 20px',
                borderRadius: '24px',
                border: 'none',
                background: !isAnnual ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: !isAnnual ? '#ffffff' : 'rgba(240, 238, 235, 0.5)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              style={{
                padding: '8px 20px',
                borderRadius: '24px',
                border: 'none',
                background: isAnnual ? 'var(--aw-teal)' : 'transparent',
                color: isAnnual ? '#080a0f' : 'rgba(240, 238, 235, 0.5)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Annual Billing</span>
              <span style={{ fontSize: '10px', background: isAnnual ? '#080a0f' : 'rgba(0, 194, 212, 0.2)', color: isAnnual ? '#00c2d4' : '#00c2d4', padding: '2px 6px', borderRadius: '10px', fontWeight: 800 }}>
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '80px' }}>
          {PLANS.map((plan) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25 }}
                style={{
                  background: plan.highlight ? 'linear-gradient(180deg, rgba(20, 26, 38, 0.9), rgba(12, 14, 20, 0.95))' : 'rgba(16, 16, 22, 0.65)',
                  border: plan.highlight ? '1px solid rgba(0, 194, 212, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '36px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: plan.highlight ? '0 20px 50px rgba(0, 194, 212, 0.12), 0 0 30px rgba(0, 194, 212, 0.05)' : '0 10px 30px rgba(0, 0, 0, 0.4)',
                  backdropFilter: 'blur(16px)'
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: plan.highlight ? 'linear-gradient(90deg, #00c2d4, #1db87a)' : 'rgba(255, 255, 255, 0.12)',
                    color: '#080a0f',
                    padding: '4px 14px',
                    borderRadius: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    boxShadow: '0 4px 12px rgba(0, 194, 212, 0.3)'
                  }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                    {plan.name}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(240, 238, 235, 0.5)', lineHeight: 1.5, minHeight: '36px' }}>
                    {plan.description}
                  </p>
                </div>

                {/* Capacity badge */}
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: plan.highlight ? '#00c2d4' : '#e0e0ea',
                  fontWeight: 600,
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Users size={13} color={plan.highlight ? '#00c2d4' : '#8b949e'} />
                  <span>{plan.workforceCapacity}</span>
                </div>

                {/* Price */}
                <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em' }}>
                    ${price}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(240, 238, 235, 0.45)' }}>
                    / month {isAnnual && '(billed annually)'}
                  </span>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleCta(plan.ctaAction)}
                  className={plan.highlight ? 'aw-btn-primary' : 'aw-btn-secondary'}
                  style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', fontSize: '13px', marginBottom: '28px' }}
                >
                  {plan.ctaText} <ArrowRight size={14} />
                </button>

                {/* Features List */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '20px', flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(240, 238, 235, 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
                    Included Capabilities:
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {plan.features.map((feat, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'rgba(240, 238, 235, 0.75)', lineHeight: 1.45 }}>
                        <Check size={14} color={plan.highlight ? '#00c2d4' : '#1db87a'} style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Feature Comparison Matrix */}
        <div style={{ background: 'rgba(14, 14, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '40px', marginBottom: '80px', overflowX: 'auto' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
            Full Feature Comparison Matrix
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(240, 238, 235, 0.5)', marginBottom: '28px' }}>
            Detailed breakdown of capabilities across all digital workforce tiers.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#8b949e', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Capability</th>
                <th style={{ padding: '12px 16px' }}>Starter</th>
                <th style={{ padding: '12px 16px', color: '#00c2d4' }}>Squad (Pro)</th>
                <th style={{ padding: '12px 16px' }}>Enterprise</th>
                <th style={{ padding: '12px 16px' }}>Autonomous</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '13px', color: '#f0eeeb' }}>
              {[
                { feature: 'Dedicated Virtual Workstations', s: '1', sq: '3', e: '10', a: 'Unlimited' },
                { feature: 'Monthly Task Runs', s: '1,500', sq: '10,000', e: 'Unlimited', a: 'Unlimited' },
                { feature: 'Teaching via PDF SOPs & Docs', s: '✓', sq: '✓', e: '✓', a: '✓' },
                { feature: 'Memory Evolution (v1 → v2)', s: 'Manual', sq: 'Autonomous', e: 'Autonomous', a: 'Custom AI Models' },
                { feature: 'Live Browser Telemetry Stream', s: '—', sq: '✓ (HD)', e: '✓ (Ultra HD)', a: '✓ (Dedicated)' },
                { feature: 'Chrome Extension Live Assist', s: 'Standard', sq: 'Full Assist', e: 'Enterprise SSO', a: 'Custom Branded' },
                { feature: 'Custom ERP / Internal API Connectors', s: '—', sq: '2 Connectors', e: 'Unlimited', a: 'Custom On-Prem' },
                { feature: 'SLA & Dedicated Engineer', s: '24h Email', sq: '4h Priority', e: '1h SLA + Dedicated', a: '24/7 Mission Control' },
              ].map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: 'rgba(240, 238, 235, 0.85)' }}>{row.feature}</td>
                  <td style={{ padding: '14px 16px', color: 'rgba(240, 238, 235, 0.6)' }}>{row.s}</td>
                  <td style={{ padding: '14px 16px', color: '#00c2d4', fontWeight: 600 }}>{row.sq}</td>
                  <td style={{ padding: '14px 16px', color: '#1db87a', fontWeight: 600 }}>{row.e}</td>
                  <td style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 600 }}>{row.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FAQ Section */}
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              Frequently Asked Questions
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'rgba(240, 238, 235, 0.5)' }}>
              Everything you need to know about hiring and managing your digital workforce.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  style={{
                    background: 'rgba(16, 16, 22, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '18px 24px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: '#f0eeeb' }}>
                      {faq.q}
                    </span>
                    {isOpen ? <ChevronUp size={16} color="#00c2d4" /> : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(240, 238, 235, 0.65)', lineHeight: 1.6, marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
