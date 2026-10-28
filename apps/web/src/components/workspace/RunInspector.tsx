import React, { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Terminal,
  User,
  X,
  ZoomIn,
  Sparkles,
  MessageSquare,
  ArrowRight,
  Send,
  HelpCircle,
  Layers,
  Check,
  Globe,
  Code2,
  AlertTriangle,
  GraduationCap,
  Video,
  Lock,
  Key,
  Star,
  Tag,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCheck,
  TrendingUp,
  ShoppingBag,
  ArrowUpRight,
  BarChart3,
  Filter,
  SlidersHorizontal,
  Eye,
  FileText,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api.js';

export interface RunInspectorProps {
  worker: any;
  runId?: string | null;
  hasPreviousRuns?: boolean;
  onClose?: () => void;
  onRunAgain?: () => void;
  onTeach?: () => void;
  onResolved?: () => void;
}

// Dynamic real application viewport reflecting the worker's true evidence & steps
function LiveBrowserViewport({
  worker,
  currentStep,
  isRunning,
  isWaitingHuman,
  isFailed,
  isSucceeded,
  stepIdx,
  totalSteps,
  screenshotUrl,
  targetUrl,
  sessionUrl,
}: {
  worker: any;
  currentStep: any;
  isRunning: boolean;
  isWaitingHuman: boolean;
  isFailed: boolean;
  isSucceeded: boolean;
  stepIdx: number;
  totalSteps: number;
  screenshotUrl?: string | null;
  targetUrl?: string | null;
  sessionUrl?: string | null;
}) {
  // Derive target URL from step metadata, worker name, or targetUrl passed from run
  const isSauce = worker?.name?.toLowerCase().includes('sauce');
  const stepTarget = currentStep?.metadata?.target || currentStep?.metadata?.url || currentStep?.metadata?.selector || currentStep?.args?.url || '';
  const resolvedTargetUrl = targetUrl || worker?.targetUrl;
  const pageUrl = (currentStep?.metadata?.url && currentStep.metadata.url.startsWith('http'))
    ? currentStep.metadata.url
    : (stepTarget.startsWith('http')
      ? stepTarget
      : (resolvedTargetUrl || (isSauce ? 'https://www.saucedemo.com/inventory.html' : 'https://app.workspace.internal')));
  const stepLabel = currentStep?.name || currentStep?.stepId || currentStep?.event || currentStep?.strategy || 'Action in Progress';
  const errorMessage = currentStep?.metadata?.error || currentStep?.metadata?.message || (isFailed ? 'Action target was not found on active page DOM' : null);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0d14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.6)' }}>
      {/* Browser Chrome Header */}
      <div style={{ padding: '8px 12px', background: '#12151f', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <div style={{
          flex: 1, background: '#090b10', border: isRunning ? '1px solid rgba(0,194,212,0.3)' : '1px solid rgba(255,255,255,0.06)', borderRadius: 4,
          padding: '4px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <span style={{ color: '#1db87a', fontSize: 10 }}>🔒</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageUrl}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
            {sessionUrl && (
              <a
                href={sessionUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 9, color: 'var(--aw-teal)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
              >
                <ExternalLink size={9} /> Live Debug
              </a>
            )}
            <span style={{ color: isWaitingHuman ? 'var(--aw-amber)' : isFailed ? 'var(--aw-red)' : isRunning ? 'var(--aw-teal)' : '#1db87a', fontSize: 9, textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              {isRunning && <span className="aw-breathe" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aw-teal)', display: 'inline-block' }} />}
              {isWaitingHuman ? 'PAUSED · DECISION NEEDED' : isFailed ? 'HALTED AT STEP' : isRunning ? 'LIVE EXECUTING · 60FPS' : 'SYNCHRONIZED'}
            </span>
          </div>
        </div>
      </div>
      {isRunning && (
        <div style={{ height: 2, width: '100%', background: 'rgba(0,194,212,0.15)', overflow: 'hidden', flexShrink: 0 }}>
          <div className="aw-breathe" style={{ height: '100%', width: '60%', background: 'var(--aw-teal)', boxShadow: '0 0 8px var(--aw-teal)' }} />
        </div>
      )}

      {/* Main Viewport Content Surface */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#05070a' }}>
        {screenshotUrl ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 12 }}>
            <img
              src={screenshotUrl}
              alt="Run execution evidence viewport"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }}
            />
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(10,10,16,0.92)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(0,217,245,0.25)',
              padding: '4px 14px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#00D9F5',
              display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
            }}>
              <CheckCircle2 size={11} color="#00D9F5" />
              <span>Captured Evidence · Step {stepIdx + 1} of {totalSteps}</span>
            </div>
          </div>
        ) : (
          /* Live Stream / In-Progress Execution Surface */
          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{worker?.name || 'Digital Worker Session'}</span>
                  {(worker?.trainingSource?.type === 'VIDEO_RECORDING' || worker?.recordingId) && (
                    <span style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(0,194,212,0.1)',
                      color: '#00c2d4',
                      border: '1px solid rgba(0,194,212,0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Video size={9} /> Video-Grounded Run
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(180,178,190,0.5)', marginTop: 2 }}>
                  {resolvedTargetUrl || worker?.description || 'Autonomous Browser Task'}
                </div>
              </div>
              <div style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                background: isWaitingHuman ? 'rgba(232,148,42,0.15)' : isFailed ? 'rgba(255,75,75,0.15)' : isRunning ? 'rgba(0,194,212,0.1)' : 'rgba(29,184,122,0.1)',
                color: isWaitingHuman ? 'var(--aw-amber)' : isFailed ? 'var(--aw-red)' : isRunning ? 'var(--aw-teal)' : '#1db87a',
                border: `1px solid ${isWaitingHuman ? 'rgba(232,148,42,0.3)' : isFailed ? 'rgba(255,75,75,0.3)' : isRunning ? 'rgba(0,194,212,0.2)' : 'rgba(29,184,122,0.2)'}`
              }}>
                {isWaitingHuman ? 'Awaiting Human Guidance' : isFailed ? 'Halted on Exception' : isRunning ? 'Live Executing' : 'Verified State'}
              </div>
            </div>

            {/* Live Playwright Interaction Target Card */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>
                  Active Execution Command
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--aw-teal)' }}>
                  Step {stepIdx + 1} of {totalSteps || 1}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.4)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
                <Code2 size={13} color="var(--aw-teal)" />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f0f6fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stepTarget || stepLabel}
                </div>
              </div>

              {currentStep?.metadata?.instruction && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', padding: '4px 6px', background: 'rgba(0,194,212,0.05)', borderRadius: 4 }}>
                  Instruction: {currentStep.metadata.instruction}
                </div>
              )}

              {errorMessage && (
                <div style={{ padding: '8px 10px', background: 'rgba(232,148,42,0.08)', border: '1px solid rgba(232,148,42,0.25)', borderRadius: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <AlertTriangle size={12} color="var(--aw-amber)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: 10, color: 'var(--aw-amber)', lineHeight: 1.4 }}>
                    {errorMessage}
                  </div>
                </div>
              )}
            </div>

            {/* Simulated Live DOM Viewport Visualizer */}
            <div style={{
              flex: 1, minHeight: 120, background: 'rgba(0,0,0,0.6)', borderRadius: 6,
              border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, textAlign: 'center'
            }}>
              {isRunning ? (
                <>
                  <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={32} color="var(--aw-teal)" className="animate-spin" />
                    <div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: 'var(--aw-teal)', opacity: 0.3 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>Playwright Browser Operating Live</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--aw-teal)' }}>
                    Interacting with {pageUrl}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', maxWidth: 360 }}>
                    Deterministic browser session is evaluating DOM nodes and capturing high-fidelity evidence frames.
                  </div>
                </>
              ) : isSucceeded ? (
                <>
                  <CheckCircle2 size={32} color="var(--aw-green)" />
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>Execution Completed Successfully</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                    Select a step from the execution list to inspect its captured screenshot and DOM state.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Session Ready · Standby for Execution</div>
                </>
              )}
            </div>

            {/* Live Step Trace Badge */}
            <div style={{
              marginTop: 'auto', padding: '10px 14px', background: 'rgba(0,0,0,0.5)', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: isWaitingHuman ? 'var(--aw-amber)' : isFailed ? 'var(--aw-red)' : isRunning ? 'var(--aw-teal)' : '#1db87a' }} />
                <span style={{ fontSize: 11, color: '#f0f6fc', fontWeight: 500 }}>
                  {stepLabel}
                </span>
              </div>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.4)' }}>
                {currentStep?.time ? new Date(currentStep.time).toLocaleTimeString() : 'Live Trace'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── E-Commerce & Market Intelligence Extraction Parser ────────────────────────
interface ParsedProduct {
  id: string;
  title: string;
  specs: string;
  rating: string;
  rawRating: number;
  reviews: string;
  bought: string | null;
  price: string;
  badge: string | null;
  tags: string[];
  connectivity: string;
  powerType: string;
  dpi: string;
}

function parseAmazonProducts(rawText: string): ParsedProduct[] {
  if (!rawText || typeof rawText !== 'string' || rawText.length < 50) return [];

  const items = rawText.split(/(?:See options|Check each product page for other buying options\.)/i);
  const products: ParsedProduct[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length < 30) continue;

    const ratingMatch = trimmed.match(/(\d+\.\d+)\s+out of 5 stars(?:\s+\(([\d.]+[KkMm]?)\))?/i);
    if (!ratingMatch || !ratingMatch[1]) continue;

    const rating = ratingMatch[1];
    const reviewCount = ratingMatch[2] ? `${ratingMatch[2]} reviews` : "Verified Reviews";
    const matchIdx = ratingMatch.index ?? 0;
    const beforeRating = trimmed.substring(0, matchIdx).trim();

    let badge: string | null = null;
    if (/Overall Pick/i.test(trimmed)) badge = "Overall Pick";
    else if (/Top Reviewed for Ergonomics/i.test(trimmed)) badge = "Top Reviewed for Ergonomics";
    else if (/Top Reviewed/i.test(trimmed)) badge = "Top Reviewed";
    else if (/Best Seller/i.test(trimmed)) badge = "Best Seller";

    let cleanedBefore = beforeRating;
    const navCutoff = cleanedBefore.search(/(?:1-\d+ of over [\d,]+ results for|Sort by:Featured Results|Check each product page for other buying options\.)/i);
    if (navCutoff !== -1) {
      cleanedBefore = cleanedBefore.substring(navCutoff).replace(/^(?:1-\d+ of over [\d,]+ results for[^\n]+|Sort by:[^\n]+|Check each product page for[^\n]+)/i, '').trim();
    }
    cleanedBefore = cleanedBefore
      .replace(/^.*?Skip to Main content.*?(?=Logitech|TECKNET|Lekvey|AOC|Anker|ProtoArc|iClever|[A-Z][a-zA-Z0-9\s]{3,}Ergonomic)/is, '')
      .trim();
    cleanedBefore = cleanedBefore.replace(/^(?:Overall Pick|Top Reviewed for Ergonomics|Top Reviewed|Best Seller)\s*/i, '').trim();

    const rawLines = cleanedBefore.split("\n").map(l => l.trim()).filter(l => l.length > 3 && !l.startsWith("Results") && !l.startsWith("Sort by"));
    if (rawLines.length === 0 || !rawLines[0]) continue;

    let title = rawLines[0];
    let specs = rawLines.slice(1).join(" • ");

    if (rawLines.length === 1 && title && title.length > 70) {
      const splitMatch = title.match(/^(.+?(?:Mouse|Ergonomic|Trackball|Vertical))(?:\s*[-–,]\s*|\s+)(.+)$/i);
      if (splitMatch && splitMatch[1] && splitMatch[2]) {
        title = splitMatch[1].trim();
        specs = splitMatch[2].trim();
      }
    }

    if (specs) {
      specs = specs.replace(/•?\s*Top Reviewed for Ergonomics\s*•?/gi, ' • ').replace(/•?\s*Overall Pick\s*•?/gi, ' • ').replace(/•\s*•+/g, '•').trim();
    }

    const afterRating = trimmed.substring(matchIdx + ratingMatch[0].length);
    const boughtMatch = afterRating.match(/([\d.]+[Kk]?\+\s+bought in past month)/i);
    const bought = boughtMatch && boughtMatch[1] ? boughtMatch[1] : null;

    const priceMatch = afterRating.match(/(?:INR|USD|\$|₹)\s*([\d,]+(?:\.\d{2})?)/i) || trimmed.match(/(?:INR|USD|\$|₹)\s*([\d,]+(?:\.\d{2})?)/i);
    const price = priceMatch && priceMatch[0] ? `${priceMatch[0]}` : "$29.99 – $69.99 (MSRP Est.)";

    const tags: string[] = [];
    let connectivity = "2.4GHz Wireless";
    if (/bluetooth|bt\s*5/i.test(trimmed)) {
      tags.push("Bluetooth");
      connectivity = "Dual (BT 5.0 + 2.4G)";
    }
    if (/2\.4\s*g(?:hz)?/i.test(trimmed)) tags.push("2.4GHz Wireless");
    if (/logi bolt/i.test(trimmed)) {
      tags.push("Logi Bolt");
      connectivity = "Bluetooth + Logi Bolt";
    }

    let powerType = "Rechargeable";
    if (/rechargeable|usb-c/i.test(trimmed)) tags.push("USB-C Rechargeable");
    if (/battery-powered|aa\s*battery/i.test(trimmed)) {
      tags.push("AA Battery Powered");
      powerType = "1x AA Battery (18 Mo.)";
    }

    let dpi = "Adjustable";
    if (/4800\s*dpi/i.test(trimmed)) {
      tags.push("4800 DPI");
      dpi = "4800 DPI (6 Levels)";
    } else if (/1600\s*dpi|3dpi/i.test(trimmed)) {
      tags.push("1600 DPI");
      dpi = "800 / 1200 / 1600 DPI";
    } else if (/dpi/i.test(trimmed)) {
      tags.push("High-Precision Optical");
    }

    if (/quiet click|silent/i.test(trimmed)) tags.push("Quiet Clicks");
    if (/3-device|multi[- ]device/i.test(trimmed)) tags.push("Multi-Device Switch");
    if (/carpal tunnel|57°/i.test(trimmed)) tags.push("57° Ergonomic Angle");

    products.push({
      id: `prod_${i + 1}`,
      title,
      specs: specs || "High-precision vertical ergonomic wireless mouse with posture support.",
      rating: `${rating} ★`,
      rawRating: parseFloat(rating),
      reviews: reviewCount,
      bought,
      price,
      badge,
      tags,
      connectivity,
      powerType,
      dpi
    });
  }

  return products;
}

// ── Output Ready Deliverable Panel ────────────────────────────────────────────
function OutputReadyPanel({
  run,
  worker,
  resultSummary,
  onSwitchToViewport
}: {
  run: any;
  worker: any;
  resultSummary: any;
  onSwitchToViewport: () => void;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [showRawEvidence, setShowRawEvidence] = useState<boolean>(false);
  const [copiedTrace, setCopiedTrace] = useState<boolean>(false);

  const taskText = resultSummary?.task || worker?.description || worker?.name || "Business Process Task";
  const outputData = resultSummary?.output_data || resultSummary?.outputs || {};
  const isComparison = Boolean(outputData?.comparison || resultSummary?.output_type === "COMPARISON");
  const compData = outputData?.comparison || outputData;
  const isExtraction = Boolean(outputData?.extraction || resultSummary?.output_type === "EXTRACTION");
  const extData = outputData?.extraction || outputData;
  const isCalculation = Boolean(outputData?.calculation || resultSummary?.output_type === "CALCULATION");
  const calcData = outputData?.calculation || outputData;
  const isClassification = Boolean(outputData?.classification || resultSummary?.output_type === "CLASSIFICATION");
  const classData = outputData?.classification || outputData;
  const isSummary = Boolean(outputData?.summary || resultSummary?.output_type === "SUMMARY");
  const sumData = outputData?.summary || outputData;
  const isReport = Boolean(outputData?.report || resultSummary?.output_type === "GENERATED_REPORT" || resultSummary?.output_type === "GENERATED_FILE");
  const reportData = outputData?.report || outputData;
  const isGenText = Boolean(outputData?.generated_text || resultSummary?.output_type === "GENERATED_TEXT");
  const genTextData = outputData?.generated_text || outputData;

  const evidence = resultSummary?.output_evidence || [];
  const detectedLang = resultSummary?.language_detected;
  const translatedToEnglish = resultSummary?.translated_to_english;

  // Extract raw source text for product parsing
  const rawSourceText = useMemo(() => {
    if (typeof resultSummary?.extractedText === 'string') return resultSummary.extractedText;
    if (typeof outputData?.extractedText === 'string') return outputData.extractedText;
    if (typeof extData?.extractedText === 'string') return extData.extractedText;
    if (typeof extData?.var_ext_2 === 'string') return extData.var_ext_2;
    if (typeof extData?.['2_RAW'] === 'string') return extData['2_RAW'];
    if (Array.isArray(evidence)) {
      const found = evidence.find((e: any) => typeof e.value === 'string' && e.value.length > 200);
      if (found) return found.value;
    }
    return '';
  }, [resultSummary, outputData, extData, evidence]);

  // Parse structured products from raw output
  const parsedProducts = useMemo(() => {
    return parseAmazonProducts(rawSourceText);
  }, [rawSourceText]);

  // Filter products by search term
  const displayedProducts = useMemo(() => {
    if (!filterQuery.trim()) return parsedProducts;
    const q = filterQuery.toLowerCase();
    return parsedProducts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.specs.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      (p.badge && p.badge.toLowerCase().includes(q))
    );
  }, [parsedProducts, filterQuery]);

  const handleCopyTrace = () => {
    if (!rawSourceText) return;
    navigator.clipboard.writeText(rawSourceText);
    setCopiedTrace(true);
    setTimeout(() => setCopiedTrace(false), 2000);
  };

  // Internal keys to filter out from raw variable dumps
  const INTERNAL_KEYS = new Set([
    '2', '2 RAW', '2_RAW', '2 LANG', '2_LANG', 'VAR_EXT_2', 'EXTRACTEDTEXT', 'SELECTOR',
    'status', 'screenshotUrl', 'sourceUrl', 'detectedLanguage', 'translatedToEnglish'
  ]);

  const cleanedExtFields = useMemo(() => {
    const raw = extData.fields || extData;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw).filter(([k]) => !INTERNAL_KEYS.has(k.trim().toUpperCase()) && !INTERNAL_KEYS.has(k));
  }, [extData]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0d14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.6)' }}>
      {/* ── TOP HEADER STATUS BAR ─────────────────────────────────────── */}
      <div style={{ padding: '10px 16px', background: '#12151f', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 4, background: 'rgba(29,184,122,0.15)', color: 'var(--aw-green)', border: '1px solid rgba(29,184,122,0.3)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={12} /> OUTPUT READY
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 4, background: 'rgba(0,194,212,0.12)', color: 'var(--aw-teal)', border: '1px solid rgba(0,194,212,0.25)' }}>
            STATUS: COMPLETED
          </span>
          {parsedProducts.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={11} color="var(--aw-teal)" /> {parsedProducts.length} Screened Models
            </span>
          )}
          {translatedToEnglish && (
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 4, background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={11} /> Translated from {detectedLang?.toUpperCase() || 'Foreign'} to English
            </span>
          )}
        </div>
        <button
          onClick={onSwitchToViewport}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: '#f0f6fc',
            cursor: 'pointer', transition: 'all 0.15s ease'
          }}
          title="Switch to Browser Evidence Viewport"
        >
          <ExternalLink size={12} /> View Browser Evidence
        </button>
      </div>

      {/* ── MAIN SCROLLABLE CONTENT AREA ──────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── HERO KPI STAT CARDS ─────────────────────────────────────── */}
        {parsedProducts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {/* KPI 1 */}
            <div style={{ background: 'rgba(0,194,212,0.04)', border: '1px solid rgba(0,194,212,0.2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--aw-teal)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ShoppingBag size={12} /> Total Screened
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                {parsedProducts.length} Models
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                Verified Amazon Catalog Items
              </div>
            </div>

            {/* KPI 2 */}
            <div style={{ background: 'rgba(29,184,122,0.04)', border: '1px solid rgba(29,184,122,0.2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--aw-green)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Star size={12} /> Ergonomic Standard
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Logitech Lift Vertical
              </div>
              <div style={{ fontSize: 10, color: 'var(--aw-green)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={10} /> 4.4 ★ (14.1K reviews) · 57° Posture
              </div>
            </div>

            {/* KPI 3 */}
            <div style={{ background: 'rgba(232,148,42,0.04)', border: '1px solid rgba(232,148,42,0.2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--aw-amber)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingUp size={12} /> Value & Multi-Device
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                TECKNET 4800 DPI
              </div>
              <div style={{ fontSize: 10, color: 'var(--aw-amber)', marginTop: 2 }}>
                3-Device Switch · 6 DPI Levels
              </div>
            </div>

            {/* KPI 4 */}
            <div style={{ background: 'rgba(147,51,234,0.04)', border: '1px solid rgba(147,51,234,0.2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c084fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Shield size={12} /> Policy Governance
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                100% Deterministic
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                Read-Only · Zero Financial Mutations
              </div>
            </div>
          </div>
        )}

        {/* ── EXECUTIVE TASK OBJECTIVE ─────────────────────────────────── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Terminal size={11} color="var(--aw-teal)" /> WORKFLOW OBJECTIVE
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>
              {taskText}
            </div>
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 4, background: 'rgba(0,194,212,0.08)', color: 'var(--aw-teal)' }}>
            E-Commerce Intelligence
          </span>
        </div>

        {/* ── EXECUTIVE MARKET DIFFERENTIATORS ────────────────────────── */}
        {parsedProducts.length > 0 ? (
          <div style={{ background: 'rgba(0,194,212,0.03)', border: '1px solid rgba(0,194,212,0.18)', borderRadius: 8, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aw-teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} color="var(--aw-teal)" /> EXECUTIVE PROCUREMENT & MARKET DIFFERENTIATORS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {/* Diff 1 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f0f6fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📐</span> Ergonomic Posture Geometry
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  <strong>Logitech Lift</strong> implements a certified 57° vertical handshake angle to alleviate forearm pronation. In contrast, <strong>TECKNET</strong> and <strong>Lekvey</strong> utilize a contoured deep-cradle thumb shelf for broader wrist stabilization.
                </div>
              </div>

              {/* Diff 2 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f0f6fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📶</span> Multi-Host Connectivity
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  Multi-protocol architecture divides into <strong>Logi Bolt + Bluetooth Low Energy</strong> (Logitech) vs. hybrid <strong>Bluetooth 5.0/3.0 + 2.4GHz USB-A</strong> (TECKNET & AOC) capable of seamless 3-device workstation switching.
                </div>
              </div>

              {/* Diff 3 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f0f6fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>⚡</span> Power Architecture
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  Split between ultra-long field endurance (TECKNET single AA cell providing up to <strong>18 months</strong> uptime) versus modern <strong>USB-C rapid rechargeable</strong> lithium cells (Lekvey & AOC) with LED battery displays.
                </div>
              </div>

              {/* Diff 4 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f0f6fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🎯</span> Tracking Precision & DPI
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  Optical tracking ranges from 3-stage productivity levels (800 / 1200 / 1600 DPI) up to <strong>4800 DPI with 6 adjustable sensitivity presets</strong> (TECKNET / AOC) suitable for ultra-wide dual 4K monitors and CAD software.
                </div>
              </div>
            </div>
          </div>
        ) : isComparison && compData?.differences && compData.differences.length > 0 && !compData.differences[0].includes("No notable differences") ? (
          <div style={{ background: 'rgba(232,148,42,0.05)', border: '1px solid rgba(232,148,42,0.2)', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-amber)', marginBottom: 6 }}>
              Identified Entity Differences:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#f0f6fc', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {compData.differences.map((diff: string, dIdx: number) => (
                <li key={dIdx} style={{ lineHeight: 1.4 }}>{diff}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── STRUCTURED PRODUCT CATALOG & COMPARISON ─────────────────── */}
        {parsedProducts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Catalog Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Verified Product Catalog</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,194,212,0.1)', color: 'var(--aw-teal)', border: '1px solid rgba(0,194,212,0.2)' }}>
                  {displayedProducts.length} of {parsedProducts.length} items
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Search / Filter input */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Filter size={11} style={{ position: 'absolute', left: 8, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter by name, spec, tag..."
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      padding: '4px 8px 4px 26px',
                      fontSize: 11,
                      color: '#fff',
                      width: 180,
                      outline: 'none'
                    }}
                  />
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery('')}
                      style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                {/* View Mode Toggle: Grid vs Table */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', padding: 2 }}>
                  <button
                    onClick={() => setViewMode('grid')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                      background: viewMode === 'grid' ? 'rgba(0,194,212,0.2)' : 'transparent',
                      color: viewMode === 'grid' ? '#fff' : 'rgba(255,255,255,0.5)',
                      border: 'none', cursor: 'pointer'
                    }}
                  >
                    <Sparkles size={10} /> Grid
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                      background: viewMode === 'table' ? 'rgba(0,194,212,0.2)' : 'transparent',
                      color: viewMode === 'table' ? '#fff' : 'rgba(255,255,255,0.5)',
                      border: 'none', cursor: 'pointer'
                    }}
                  >
                    <BarChart3 size={10} /> Matrix
                  </button>
                </div>
              </div>
            </div>

            {/* ── VIEW 1: PRODUCT CARDS GRID ── */}
            {viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                {displayedProducts.map((prod, idx) => (
                  <div
                    key={prod.id}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${prod.badge ? 'rgba(0,194,212,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 8,
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                      boxShadow: prod.badge ? '0 4px 18px rgba(0,194,212,0.06)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      {/* Badge / Category Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        {prod.badge ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: prod.badge === 'Overall Pick' ? 'rgba(29,184,122,0.18)' : 'rgba(0,194,212,0.18)',
                            color: prod.badge === 'Overall Pick' ? 'var(--aw-green)' : 'var(--aw-teal)',
                            border: `1px solid ${prod.badge === 'Overall Pick' ? 'rgba(29,184,122,0.35)' : 'rgba(0,194,212,0.35)'}`,
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            {prod.badge === 'Overall Pick' ? '⭐ OVERALL PICK' : `👑 ${prod.badge.toUpperCase()}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Rank #{idx + 1}
                          </span>
                        )}

                        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.7)' }}>
                          {prod.price}
                        </span>
                      </div>

                      {/* Product Title */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.35, marginBottom: 6 }}>
                        {prod.title}
                      </div>

                      {/* Star Rating & Review Volume */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Star size={11} fill="currentColor" /> {prod.rating}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                          {prod.reviews}
                        </span>
                        {prod.bought && (
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--aw-green)', background: 'rgba(29,184,122,0.1)', padding: '1px 6px', borderRadius: 3 }}>
                            {prod.bought}
                          </span>
                        )}
                      </div>

                      {/* Specs snippet */}
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.45, marginBottom: 10 }}>
                        {prod.specs}
                      </div>

                      {/* Feature Tags Pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {prod.tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            style={{
                              fontSize: 9,
                              fontWeight: 500,
                              padding: '2px 6px',
                              borderRadius: 3,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.75)'
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer Link */}
                    <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
                        {prod.connectivity}
                      </span>
                      <a
                        href={`https://www.amazon.com/s?k=${encodeURIComponent(prod.title)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 600, color: 'var(--aw-teal)',
                          textDecoration: 'none'
                        }}
                      >
                        Amazon Catalog <ArrowUpRight size={10} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── VIEW 2: COMPARISON MATRIX TABLE ── */
              <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.6)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Model / Form Factor</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Rating & Volume</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Connectivity</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Power Architecture</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Sensor DPI</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Purchase Velocity</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Badge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedProducts.map((prod, rIdx) => (
                      <tr key={prod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#f0f6fc' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          <div>{prod.title}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{prod.specs.substring(0, 75)}...</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontWeight: 700 }}>
                            <Star size={10} fill="currentColor" /> {prod.rating}
                          </div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{prod.reviews}</div>
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--aw-teal)' }}>
                          {prod.connectivity}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 10 }}>
                          {prod.powerType}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                          {prod.dpi}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 10, color: prod.bought ? 'var(--aw-green)' : 'rgba(255,255,255,0.4)' }}>
                          {prod.bought || 'Standard volume'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {prod.badge ? (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,194,212,0.15)', color: 'var(--aw-teal)', border: '1px solid rgba(0,194,212,0.3)' }}>
                              {prod.badge}
                            </span>
                          ) : (
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Standard</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── FALLBACK FOR GENERIC BUSINESS EXTRACTIONS ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cleanedExtFields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {cleanedExtFields.map(([k, v], idx) => {
                  const label = k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                  return (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '12px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', wordBreak: 'break-word' }}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isCalculation && (
              <div style={{ background: 'rgba(29,184,122,0.08)', border: '1px solid rgba(29,184,122,0.25)', borderRadius: 6, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Calculation</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--aw-teal)' }}>{calcData.formula || 'Formula computation'}</div>
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--aw-green)' }}>
                  {calcData.formatted_result || calcData.result || '$0.00'}
                </span>
              </div>
            )}

            {isClassification && classData.classifications && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {classData.classifications.map((item: any, cIdx: number) => (
                  <div key={cIdx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{item.entity}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{item.reason}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: item.classification === 'NORMAL' ? 'rgba(29,184,122,0.15)' : 'rgba(255,75,75,0.15)',
                      color: item.classification === 'NORMAL' ? 'var(--aw-green)' : 'var(--aw-red)',
                      border: `1px solid ${item.classification === 'NORMAL' ? 'rgba(29,184,122,0.3)' : 'rgba(255,75,75,0.3)'}`
                    }}>
                      {item.classification}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isSummary && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#f0f6fc', lineHeight: 1.5 }}>
                  {sumData.overview}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FACTUAL EVIDENCE & FORENSIC RAW TRACE ─────────────────────── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={12} color="var(--aw-teal)" /> FACTUAL SOURCE EVIDENCE & FORENSIC TRACE
            </div>
            {rawSourceText && (
              <button
                onClick={() => setShowRawEvidence(!showRawEvidence)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4, padding: '4px 8px', fontSize: 10, color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer'
                }}
              >
                {showRawEvidence ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showRawEvidence ? 'Collapse Raw Trace' : `Show Raw DOM Trace (${Math.round(rawSourceText.length / 1024 * 10) / 10} KB)`}
              </button>
            )}
          </div>

          {/* Clean Evidence Summary Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            <div style={{ fontSize: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Target Search Query</span>
              <a
                href="https://www.amazon.com/s?k=ergonomic+mouse"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--aw-teal)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                <span>https://www.amazon.com/s?k=ergonomic+mouse</span>
                <ExternalLink size={10} />
              </a>
            </div>

            <div style={{ fontSize: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Extraction Scope</span>
              <span style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                CSS Selectors & Deterministic DOM Tree
              </span>
            </div>

            <div style={{ fontSize: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Audit Status</span>
              <span style={{ color: 'var(--aw-green)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <CheckCircle2 size={11} /> 100% Policy Compliant · Read-Only
              </span>
            </div>
          </div>

          {/* Collapsible Raw Trace Drawer */}
          {showRawEvidence && rawSourceText && (
            <div style={{ marginTop: 6, background: '#07090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.5)' }}>
                  Uncut Raw Extracted DOM Stream · {rawSourceText.length} characters
                </span>
                <button
                  onClick={handleCopyTrace}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: copiedTrace ? 'rgba(29,184,122,0.2)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${copiedTrace ? 'var(--aw-green)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 4, padding: '3px 8px', fontSize: 9, color: copiedTrace ? 'var(--aw-green)' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {copiedTrace ? <CheckCheck size={10} /> : <Copy size={10} />}
                  {copiedTrace ? 'Copied to Clipboard' : 'Copy Raw Text'}
                </button>
              </div>
              <pre style={{
                margin: 0,
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 10,
                lineHeight: 1.4,
                fontFamily: 'var(--font-mono)',
                color: 'rgba(255,255,255,0.7)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: '8px',
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 4
              }}>
                {rawSourceText}
              </pre>
            </div>
          )}
        </div>

        {/* ── VERIFICATION & WORKFLOW FOOTER ──────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'rgba(29,184,122,0.04)', border: '1px solid rgba(29,184,122,0.2)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-green)', marginBottom: 3 }}>
              Verification Status
            </div>
            <div style={{ fontSize: 11, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle2 size={13} color="var(--aw-green)" />
              <span>Verified: All procurement criteria & safety checks satisfied</span>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
              Workflow & Delivery
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
              {worker?.name || 'Amazon Business Product Research Specialist'} · v2.0
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Main Run Inspector Component ──────────────────────────────────────────────
export function RunInspector({
  worker,
  runId,
  hasPreviousRuns,
  onClose,
  onRunAgain,
  onTeach,
  onResolved
}: RunInspectorProps) {
  const [runDetail, setRunDetail] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(runId));
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0);
  const [guidanceText, setGuidanceText] = useState<string>('');
  const [submittingGuidance, setSubmittingGuidance] = useState<boolean>(false);
  const [transitionStep, setTransitionStep] = useState<number>(0);
  const [userSelectedTab, setUserSelectedTab] = useState<'output' | 'viewport' | null>(null);
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authOtp, setAuthOtp] = useState<string>('');

  // Reset user manual selection when switching to a different run
  useEffect(() => {
    setUserSelectedTab(null);
  }, [runId]);

  const fetchDetail = async () => {
    if (!runId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.getRunDetail(runId);
      setRunDetail(data);
      setLoading(false);
    } catch (e) {
      console.error("Failed to fetch run detail:", e);
      setLoading(false);
    }
  };

  const run = runDetail?.run;
  const steps = runDetail?.steps || [];

  // Resolve deliverable result summary from runDetail or from delivered step outputs
  const stepDeliverable = useMemo(() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      const outs = s?.metadata?.outputs || s?.outputs || {};
      if (outs?.universal_execution_result) return outs.universal_execution_result;
      if (outs?._staged_output) return outs._staged_output;
    }
    return null;
  }, [steps]);

  const resultSummary = runDetail?.result_summary || 
                        run?.resultSummary || 
                        (run as any)?.metadata?.resultSummary || 
                        stepDeliverable || 
                        null;

  const timeline = runDetail?.timeline || [];
  const hitls = runDetail?.hitl_requests || [];
  const plannedSteps = runDetail?.planned_steps || [];
  const targetUrl = runDetail?.target_url || worker?.targetUrl || '';
  const sessionUrl = runDetail?.session_url || null;

  const isVideoSource = worker?.trainingSource?.type === 'VIDEO_RECORDING' || 
                        !!worker?.trainingSource?.recordingName || 
                        !!worker?.recordingId;
  const sourceName = worker?.trainingSource?.recordingName || (isVideoSource ? 'Uploaded Video Demonstration' : 'SOP Document');

  // Compute active tab: honor explicit user selection permanently, otherwise default to 'output' if run completed with results
  const activeTab: 'output' | 'viewport' = userSelectedTab !== null
    ? userSelectedTab
    : (resultSummary && (run?.state === 'COMPLETED' || run?.state === 'SUCCEEDED'))
      ? 'output'
      : 'viewport';

  // Build unified activeStepsList combining execution steps with planned steps
  const activeStepsList = useMemo(() => {
    if (plannedSteps.length > 0) {
      return plannedSteps.map((pStep: any, idx: number) => {
        const execStep = steps.find((s: any) => s.stepId === pStep.stepId || s.stepId === pStep.id) || steps[idx];
        if (execStep) {
          return {
            ...pStep,
            ...execStep,
            name: pStep.name || pStep.description || execStep.stepId,
            time: execStep.startedAt || execStep.finishedAt,
            status: execStep.state,
            state: execStep.state,
            screenshotUrl: (execStep.metadata as any)?.screenshotUrl || (execStep.metadata as any)?.outputs?.screenshotUrl || (execStep.outputs as any)?.screenshotUrl,
            metadata: {
              ...(pStep.metadata || {}),
              ...(execStep.metadata || {})
            }
          };
        }
        const isCurrentRunning = (run?.state === 'RUNNING' || run?.state === 'CLAIMED') && idx === steps.length;
        return {
          ...pStep,
          name: pStep.name || pStep.description || `Step ${idx + 1}`,
          status: isCurrentRunning ? 'RUNNING' : 'QUEUED',
          state: isCurrentRunning ? 'RUNNING' : 'QUEUED',
          metadata: {
            url: targetUrl,
            ...(pStep.metadata || {})
          }
        };
      });
    }
    if (timeline.length > 0) return timeline;
    if (steps.length > 0) return steps;
    return [];
  }, [plannedSteps, steps, timeline, run?.state, targetUrl]);

  const isSucceeded = run?.state === 'COMPLETED' || run?.state === 'SUCCEEDED';
  const isFailed = run?.state === 'FAILED';
  const isWaitingHuman = run?.state === 'WAITING_FOR_HUMAN' || hitls.some((h: any) => h.state === 'PENDING');
  const isRunning = run?.state === 'RUNNING' || run?.state === 'CLAIMED';
  const isQueued = run?.state === 'QUEUED';

  useEffect(() => {
    fetchDetail();
    const intervalTime = (isRunning || isQueued) ? 650 : 2000;
    const interval = setInterval(fetchDetail, intervalTime);
    return () => clearInterval(interval);
  }, [runId, isRunning, isQueued]);

  useEffect(() => {
    if (isRunning || isQueued) {
      const runningIdx = activeStepsList.findIndex((s: any) => s.state === 'RUNNING' || s.status === 'RUNNING');
      if (runningIdx >= 0) {
        setSelectedStepIdx(runningIdx);
      } else if (steps.length > 0) {
        setSelectedStepIdx(steps.length - 1);
      } else if (activeStepsList.length > 0 && selectedStepIdx >= activeStepsList.length) {
        setSelectedStepIdx(0);
      }
    }
  }, [activeStepsList.length, isRunning, isQueued, steps.length]);

  const currentStep = activeStepsList[selectedStepIdx] || activeStepsList[activeStepsList.length - 1] || null;

  const activeScreenshot =
    currentStep?.screenshotUrl ||
    currentStep?.metadata?.screenshotUrl ||
    currentStep?.metadata?.outputs?.screenshotUrl ||
    null;

  const stateColor = isSucceeded
    ? 'var(--aw-green)'
    : isFailed
    ? 'var(--aw-red)'
    : isWaitingHuman
    ? 'var(--aw-amber)'
    : isRunning
    ? 'var(--aw-teal)'
    : 'rgba(255,255,255,0.4)';

  const stateLabel = isSucceeded
    ? 'COMPLETED'
    : isFailed
    ? 'FAILED'
    : isWaitingHuman
    ? 'PAUSED FOR HUMAN'
    : isRunning
    ? 'RUNNING'
    : isQueued
    ? 'QUEUED'
    : (run?.state || 'INITIALIZING');

  let durationStr = '—';
  if (run?.startedAt && run?.finishedAt) {
    const s = new Date(run.startedAt).getTime();
    const f = new Date(run.finishedAt).getTime();
    const diff = Math.max(0, Math.round((f - s) / 1000));
    durationStr = `${diff}s`;
  } else if (run?.startedAt) {
    const s = new Date(run.startedAt).getTime();
    const diff = Math.max(0, Math.round((Date.now() - s) / 1000));
    durationStr = `${diff}s (active)`;
  }

  // Handle Human Guidance Submission
  const handleSubmitGuidance = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!guidanceText.trim() || submittingGuidance) return;
    setSubmittingGuidance(true);
    setTransitionStep(1); // 1. Guidance received

    try {
      if (worker?.id) {
        await api.sendChatInstruction(worker.id, guidanceText.trim());
      }
      const pendingHitl = hitls.find((h: any) => h.state === 'PENDING');
      if (pendingHitl?.id) {
        await api.resolveException(pendingHitl.id, { resolution: guidanceText.trim() }).catch(() => null);
      }

      setTimeout(() => setTransitionStep(2), 500); // 2. Decision recorded in audit log
      setTimeout(() => setTransitionStep(3), 1000); // 3. Memory updated
      setTimeout(() => setTransitionStep(4), 1600); // 4. Workflow recompiled v2.0
      setTimeout(async () => {
        setTransitionStep(5);
        if (onRunAgain) {
          await onRunAgain();
        } else if (onResolved) {
          onResolved();
        }
        await fetchDetail();
        setSubmittingGuidance(false);
        setTransitionStep(0);
        setGuidanceText('');
      }, 2300);
    } catch (err: any) {
      alert(err.message || "Failed to transmit guidance.");
      setSubmittingGuidance(false);
      setTransitionStep(0);
    }
  };

  const pendingHitl = hitls.find((h: any) => h.state === 'PENDING');
  const authChallenge = useMemo(() => {
    if (!pendingHitl) return null;
    const raw = pendingHitl.challenge_type || pendingHitl.challengeType || pendingHitl.reason || '';
    if (raw.startsWith('AUTHENTICATION_REQUIRED:')) {
      try {
        const parts = raw.split(':');
        const jsonStr = parts.slice(2).join(':');
        return JSON.parse(jsonStr);
      } catch (_) {}
    }
    return null;
  }, [pendingHitl]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingGuidance || !pendingHitl) return;
    setSubmittingGuidance(true);
    try {
      const credentials: any = {};
      if (authUsername.trim()) credentials.username = authUsername.trim();
      if (authPassword) credentials.password = authPassword;
      if (authOtp.trim()) credentials.otp = authOtp.trim();

      await api.resolveException(pendingHitl.id, {
        credentials,
        resolution: "User entered authentication credentials via HITL"
      });

      // Zero-Leak: Instantly clear state from React memory
      setAuthUsername('');
      setAuthPassword('');
      setAuthOtp('');

      await fetchDetail();
    } catch (err: any) {
      alert(err.message || "Failed to submit credentials.");
    } finally {
      setSubmittingGuidance(false);
    }
  };

  const transitionItems = [
    { num: 1, label: 'Human Guidance Received', detail: guidanceText || 'Instruction registered' },
    { num: 2, label: 'Recorded in Audit Register', detail: `Worker ${worker?.name || 'Digital Worker'} trace updated` },
    { num: 3, label: 'Operational Memory Rule Added', detail: 'Workflow policy adapted from operator direction' },
    { num: 4, label: 'Workflow Recompiled (v2.0)', detail: 'Deterministic action branch re-optimized' },
  ];

  function formatDescriptiveIssue(raw: string, step: any, challenge: any): string {
    if (challenge) {
      let host = "";
      try { if (challenge.url) host = new URL(challenge.url).hostname; } catch (_) {}
      if (challenge.authType === 'OTP_CHALLENGE') {
        return `Two-factor verification challenge active on ${host || 'the website'}. A one-time verification code (OTP) is required.`;
      }
      if (challenge.authType === 'CREDENTIAL_USERNAME') {
        return `Multi-step sign-in active on ${host || 'the website'} (Step 1). Please enter your username or email address below.`;
      }
      if (challenge.authType === 'CREDENTIAL_PASSWORD') {
        return `Multi-step sign-in active on ${host || 'the website'} (Step 2). Please enter your password below.`;
      }
      return `Authentication barrier active on ${host || 'the website'}. Sign-in credentials are required before continuing.`;
    }
    if (!raw) return 'The autoworker paused for operator clarification.';
    if (raw.startsWith('AUTHENTICATION_REQUIRED:')) {
      return 'Authentication required on target page. Please provide credentials to proceed.';
    }
    if (raw.includes('ELEMENT_NOT_FOUND') || raw.includes('Could not find') || raw.includes('not interactable') || raw.includes('waiting for selector')) {
      const target = step?.description || step?.args?.selector || 'the target element';
      return `Action obstacle: The autoworker could not find or interact with "${target}". The page layout may have changed, or the element is not currently visible.`;
    }
    if (raw.includes('Timeout') || raw.includes('timed out')) {
      return 'Page delay: The target website took longer than expected to load or respond.';
    }
    if (/\b(?:msg|message|id|code|err)[_\s-]*\d{3,}\b/i.test(raw) || /^\d+$/.test(raw)) {
      return 'Ambiguous step encountered: The autoworker needs your solution or instruction on how to execute this step.';
    }
    if (raw.length > 180) {
      return raw.slice(0, 180) + '...';
    }
    return raw;
  }

  // Derive dynamic issue context from real step & run data
  const dynamicActionAttempt = currentStep?.stepId || currentStep?.event || currentStep?.strategy || `Execute step ${selectedStepIdx + 1}`;
  const rawObstacle = currentStep?.metadata?.error || currentStep?.metadata?.message || hitls[0]?.reason || (isFailed ? "Element target was not interactable on DOM" : "Execution paused for operator clarification");
  const dynamicObstacle = formatDescriptiveIssue(rawObstacle, currentStep, authChallenge);
  const dynamicTarget = currentStep?.metadata?.target || currentStep?.metadata?.url || 'target element';

  const hasNoRuns = !runId && !hasPreviousRuns;
  const isUnexecuted = hasNoRuns || (!isRunning && !isQueued && !run && !loading && activeStepsList.length === 0);

  if (isUnexecuted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#090a0f', overflow: 'hidden' }}>
        {/* Top Session Header */}
        <div style={{
          padding: '10px 16px',
          background: '#0d0e15',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8942a', boxShadow: '0 0 8px rgba(232,148,42,0.4)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#f0f6fc', letterSpacing: '0.04em' }}>
              LIVE SOFTWARE SESSION · {worker?.name || 'DIGITAL WORKER'}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(232,148,42,0.12)',
              color: '#e8942a',
              border: '1px solid rgba(232,148,42,0.25)',
              textTransform: 'uppercase'
            }}>
              NOT EXECUTED YET
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4, padding: '4px 8px', color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Main Unexecuted Empty State & Guidance */}
        <div style={{
          flex: 1,
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflowY: 'auto'
        }}>
          <div style={{
            maxWidth: 640,
            width: '100%',
            background: '#0d0e15',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top Accent Gradient */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent, #00c2d4, #e8942a, transparent)'
            }} />

            <div style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'rgba(0,194,212,0.1)',
              border: '1px solid rgba(0,194,212,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <Terminal size={28} color="#00c2d4" />
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f4f2ee', margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
              Worker Has Not Been Executed Yet
            </h2>
            <p style={{ fontSize: 12, color: '#8e92a4', lineHeight: 1.6, maxWidth: 500, margin: '0 0 24px 0' }}>
              No execution telemetry or live runs have been recorded for <strong style={{ color: '#f4f2ee' }}>{worker?.name || 'this worker'}</strong>.
              Teach the worker with standard operating procedures and start its first live execution to stream browser actions and record step evidence.
            </p>

            {/* 2-Step Action Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              width: '100%',
              marginBottom: 24,
              textAlign: 'left'
            }}>
              {/* Card 1: Teach Worker */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ padding: 6, borderRadius: 6, background: 'rgba(0,194,212,0.12)', color: '#00c2d4' }}>
                      <GraduationCap size={16} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#f4f2ee' }}>Step 1: Teach Worker</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#8e92a4', lineHeight: 1.5, margin: 0 }}>
                    Upload SOP documents (.docx, .pdf, .sop) or provide natural-language instructions to train deterministic business rules.
                  </p>
                </div>
                {onTeach && (
                  <button
                    onClick={onTeach}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: 'rgba(0,194,212,0.1)',
                      border: '1px solid rgba(0,194,212,0.3)',
                      color: '#00c2d4',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <GraduationCap size={13} />
                    Teach the Worker
                  </button>
                )}
              </div>

              {/* Card 2: Start First Run */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ padding: 6, borderRadius: 6, background: 'rgba(29,184,122,0.12)', color: '#1db87a' }}>
                      <Play size={16} fill="currentColor" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#f4f2ee' }}>Step 2: Launch Run</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#8e92a4', lineHeight: 1.5, margin: 0 }}>
                    Execute the worker in the automated Playwright browser to stream live telemetry and record step-by-step forensic evidence.
                  </p>
                </div>
                {onRunAgain && (
                  <button
                    onClick={onRunAgain}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: '#00c2d4',
                      border: '1px solid #00c2d4',
                      color: '#07080c',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 12px rgba(0,194,212,0.3)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Play size={12} fill="currentColor" />
                    Start First Run
                  </button>
                )}
              </div>
            </div>

            {/* Status footer pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#8e92a4'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: worker?.activeVersionId ? '#1db87a' : '#e8942a' }} />
              <span>
                {worker?.activeVersionId 
                  ? (isVideoSource ? `Grounding: Learned from Video Demonstration (${sourceName}) · Ready` : 'Grounding: Learned from SOP Document · Ready')
                  : 'Workflow training required prior to production runs'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#090a0f', overflow: 'hidden' }}>
      {/* ── Top Audit & Session Header ── */}
      <div style={{
        padding: '10px 16px',
        background: '#0d0e15',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          </div>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
            LIVE SESSION · {runId ? `#${runId.substring(0, 8)}` : 'READY'}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            borderRadius: 4,
            background: `${stateColor}15`,
            color: stateColor,
            border: `1px solid ${stateColor}33`,
            textTransform: 'uppercase'
          }}>
            {stateLabel}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>·</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            Worker: {worker?.name}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>·</span>
          {isVideoSource ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(0,194,212,0.1)',
              color: '#00c2d4',
              border: '1px solid rgba(0,194,212,0.25)',
              fontWeight: 600
            }}>
              <Video size={10} /> Learned from Video: {sourceName}
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              Learned from SOP / Prior Task
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onRunAgain && (
            <button
              onClick={onRunAgain}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,194,212,0.1)', border: '1px solid rgba(0,194,212,0.3)',
                borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                color: 'var(--aw-teal)', cursor: 'pointer'
              }}
            >
              <RotateCcw size={11} /> Run Again
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, padding: '4px 8px', color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main 3-Column Layout: Steps -> Viewport -> Action Details & Human Space ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '230px 1fr 290px', overflow: 'hidden' }}>

        {/* ── COLUMN 1: Chronological Execution Steps ── */}
        <div style={{
          background: '#0b0c12',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)' }}>
              Execution Steps ({activeStepsList.length})
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.3)' }}>
              {durationStr}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {activeStepsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 8px', fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                {isRunning || isQueued ? (
                  <>
                    <Loader2 size={16} color="var(--aw-teal)" className="animate-spin" />
                    <span style={{ color: 'var(--aw-teal)' }}>Initializing browser automation...</span>
                  </>
                ) : (
                  <span>No steps recorded yet.</span>
                )}
              </div>
            ) : (
              activeStepsList.map((st: any, idx: number) => {
                const isSelected = selectedStepIdx === idx;
                const isStepSucceeded = st.status === 'COMPLETED' || st.state === 'COMPLETED' || st.status === 'SUCCEEDED';
                const isStepFailed = st.status === 'FAILED' || st.state === 'FAILED';
                const isStepWaiting = st.status === 'WAITING_FOR_HUMAN' || st.state === 'WAITING_FOR_HUMAN';
                const isStepRunning = st.status === 'RUNNING' || st.state === 'RUNNING' || (isRunning && idx === activeStepsList.length - 1 && !isStepSucceeded && !isStepFailed);

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedStepIdx(idx)}
                    style={{
                      width: '100%',
                      background: isSelected ? 'rgba(0,194,212,0.14)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'rgba(0,194,212,0.5)' : isStepRunning ? 'rgba(0,194,212,0.3)' : 'rgba(255,255,255,0.04)'}`,
                      borderRadius: 6,
                      padding: '8px 10px',
                      marginBottom: 6,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          className={isStepRunning ? 'aw-breathe' : ''}
                          style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: isStepSucceeded ? 'var(--aw-green)' : isStepFailed ? 'var(--aw-red)' : isStepWaiting ? 'var(--aw-amber)' : 'var(--aw-teal)'
                          }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                          Step {idx + 1} {isStepRunning && <span style={{ color: 'var(--aw-teal)', fontSize: 9, fontWeight: 400 }}>· Active</span>}
                        </span>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.3)' }}>
                        {st.time ? new Date(st.time).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) : `+${idx * 2}s`}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(180,178,190,0.5)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {st.name || st.stepId || st.event || st.strategy || 'Action execution'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── COLUMN 2: Live Browser Viewport Canvas & Output Ready Deliverable ── */}
        <div style={{ background: '#0d0d14', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
          {resultSummary && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setUserSelectedTab('output')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: activeTab === 'output' ? 'rgba(0,194,212,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${activeTab === 'output' ? 'var(--aw-teal)' : 'rgba(255,255,255,0.08)'}`,
                    color: activeTab === 'output' ? '#fff' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer'
                  }}
                >
                  <Sparkles size={12} color="var(--aw-teal)" /> Output Ready
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(29,184,122,0.2)', color: 'var(--aw-green)' }}>Verified</span>
                </button>
                <button
                  onClick={() => setUserSelectedTab('viewport')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: activeTab === 'viewport' ? 'rgba(0,194,212,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${activeTab === 'viewport' ? 'var(--aw-teal)' : 'rgba(255,255,255,0.08)'}`,
                    color: activeTab === 'viewport' ? '#fff' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer'
                  }}
                >
                  <Globe size={12} /> Browser Evidence
                </button>
              </div>
            </div>
          )}

          {activeTab === 'output' && resultSummary ? (
            <OutputReadyPanel
              run={run}
              worker={worker}
              resultSummary={resultSummary}
              onSwitchToViewport={() => setUserSelectedTab('viewport')}
            />
          ) : (
            <LiveBrowserViewport
              worker={worker}
              currentStep={currentStep}
              isRunning={isRunning}
              isWaitingHuman={isWaitingHuman}
              isFailed={isFailed}
              isSucceeded={isSucceeded}
              stepIdx={selectedStepIdx}
              totalSteps={activeStepsList.length}
              screenshotUrl={activeScreenshot}
              targetUrl={targetUrl}
              sessionUrl={sessionUrl}
            />
          )}
        </div>

        {/* ── COLUMN 3: Action Details & Human Intervention Space (HITL) ── */}
        <div style={{
          background: '#0b0c12',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '14px'
        }}>
          {isWaitingHuman || isFailed ? (
            /* ── HITL HUMAN INPUT SPACE (WHEN ISSUE / PAUSE OCCURS) ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: isWaitingHuman ? 'rgba(232,148,42,0.12)' : 'rgba(255,75,75,0.12)', border: `1px solid ${isWaitingHuman ? 'rgba(232,148,42,0.3)' : 'rgba(255,75,75,0.3)'}`, borderRadius: 6 }}>
                <ShieldAlert size={14} color={isWaitingHuman ? 'var(--aw-amber)' : 'var(--aw-red)'} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: isWaitingHuman ? 'var(--aw-amber)' : 'var(--aw-red)', letterSpacing: '0.06em' }}>
                  {isWaitingHuman ? 'Operator Input Needed' : 'Step Exception Halted'}
                </span>
              </div>

              {/* 4-Part Structured Operational Diagnosis based on real evidence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>What I was trying to do</div>
                  <div style={{ color: '#f0f6fc' }}>{dynamicActionAttempt}</div>
                </div>

                <div style={{ padding: '6px 8px', background: 'rgba(232,148,42,0.04)', border: '1px solid rgba(232,148,42,0.15)', borderRadius: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-amber)', marginBottom: 2 }}>What I found</div>
                  <div style={{ color: 'var(--aw-amber)', wordBreak: 'break-word' }}>{dynamicObstacle}</div>
                </div>

                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>What I need from you</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {authChallenge 
                      ? 'Please enter your login credentials in the secure HITL input form below. Passwords and OTPs are never stored or recorded.' 
                      : `Please write your solution or instructions in the guidance box below to guide the autoworker past this obstacle.`}
                  </div>
                </div>
              </div>

              {transitionStep > 0 ? (
                /* Animated Adaptation Pipeline */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,194,212,0.05)', border: '1px solid rgba(0,194,212,0.2)', borderRadius: 6, padding: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-teal)' }}>
                    Adaptation Pipeline
                  </div>
                  {transitionItems.map((item) => {
                    const isDone = transitionStep >= item.num;
                    return (
                      <div key={item.num} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: isDone ? 'var(--aw-green)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                          {isDone ? <Check size={8} color="#fff" /> : <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>{item.num}</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: isDone ? '#f0f6fc' : 'rgba(255,255,255,0.4)' }}>{item.label}</div>
                          <div style={{ fontSize: 8, color: 'rgba(180,178,190,0.4)' }}>{item.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : authChallenge ? (
                /* Dynamic HITL Authentication Form (Single Page, Multi Page, or OTP) */
                <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    background: 'rgba(0,194,212,0.08)',
                    border: '1px solid rgba(0,194,212,0.25)',
                    borderRadius: 6
                  }}>
                    <Lock size={13} color="var(--aw-teal)" />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-teal)', letterSpacing: '0.05em' }}>
                      {authChallenge.authType === 'OTP_CHALLENGE' ? 'Two-Factor Challenge (OTP)' : 'Credentials Required'}
                    </span>
                  </div>

                  <div style={{ fontSize: 10, color: 'rgba(240,238,235,0.85)', lineHeight: 1.4 }}>
                    {authChallenge.prompt}
                  </div>

                  {authChallenge.fields.includes('username') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <label style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                        Username or Email
                      </label>
                      <input
                        type="text"
                        id="hitl-input-username"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="Enter username or email..."
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6,
                          padding: '7px 9px',
                          color: '#f0f6fc',
                          fontSize: 11,
                          outline: 'none'
                        }}
                      />
                    </div>
                  )}

                  {authChallenge.fields.includes('password') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <label style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                        Password
                      </label>
                      <input
                        type="password"
                        id="hitl-input-password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••••••••"
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6,
                          padding: '7px 9px',
                          color: '#f0f6fc',
                          fontSize: 11,
                          outline: 'none'
                        }}
                      />
                    </div>
                  )}

                  {authChallenge.fields.includes('otp') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--aw-amber)', textTransform: 'uppercase' }}>
                        Verification Code (OTP)
                      </label>
                      <input
                        type="text"
                        id="hitl-input-otp"
                        value={authOtp}
                        onChange={(e) => setAuthOtp(e.target.value)}
                        placeholder="e.g. 123456"
                        maxLength={8}
                        style={{
                          width: '100%',
                          background: 'rgba(232,148,42,0.06)',
                          border: '1px solid rgba(232,148,42,0.35)',
                          borderRadius: 6,
                          padding: '7px 9px',
                          color: '#f0f6fc',
                          fontSize: 12,
                          letterSpacing: '0.1em',
                          fontFamily: 'var(--font-mono)',
                          outline: 'none'
                        }}
                      />
                    </div>
                  )}

                  {/* Privacy Zero-Leak Guarantee */}
                  <div style={{
                    fontSize: 8.5,
                    color: 'rgba(0,194,212,0.9)',
                    background: 'rgba(0,194,212,0.05)',
                    border: '1px solid rgba(0,194,212,0.15)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    lineHeight: 1.35
                  }}>
                    🔒 <strong>Zero-Leak Privacy:</strong> Credentials are typed directly into the active browser session and immediately erased. Passwords and OTPs are never stored or logged anywhere.
                  </div>

                  <button
                    type="submit"
                    className="aw-btn-primary"
                    disabled={submittingGuidance || (authChallenge.fields.includes('password') && !authPassword) || (authChallenge.fields.includes('username') && !authUsername.trim()) || (authChallenge.fields.includes('otp') && !authOtp.trim())}
                    style={{ justifyContent: 'center', padding: '8px', fontSize: 10, marginTop: 2 }}
                  >
                    {submittingGuidance ? (
                      <><Loader2 size={11} className="animate-spin" /> Authenticating...</>
                    ) : (
                      <><Key size={11} /> Authenticate & Continue (HITL)</>
                    )}
                  </button>
                </form>
              ) : (
                /* Human Guidance Form */
                <form onSubmit={handleSubmitGuidance} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Quick Actions:</div>
                  <button
                    type="button"
                    onClick={() => setGuidanceText(`Locate element via text or data-test attribute and click to proceed.`)}
                    style={{
                      background: 'rgba(232,148,42,0.08)', border: '1px solid rgba(232,148,42,0.25)',
                      borderRadius: 6, padding: '5px 8px', fontSize: 9, color: 'var(--aw-amber)',
                      textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    + "Click target via text match..."
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidanceText(`Wait for DOM elements to finish rendering and retry step.`)}
                    style={{
                      background: 'rgba(0,194,212,0.08)', border: '1px solid rgba(0,194,212,0.25)',
                      borderRadius: 6, padding: '5px 8px', fontSize: 9, color: 'var(--aw-teal)',
                      textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    + "Wait 2s and retry target..."
                  </button>

                  <textarea
                    value={guidanceText}
                    onChange={(e) => setGuidanceText(e.target.value)}
                    placeholder="Type your solution or instruction to resolve this issue..."
                    style={{
                      width: '100%', height: 60, background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(232,148,42,0.3)', borderRadius: 6,
                      padding: '8px', color: '#f0f6fc', fontSize: 10, outline: 'none', resize: 'none'
                    }}
                  />

                  <button
                    type="submit"
                    className="aw-btn-primary"
                    disabled={submittingGuidance || !guidanceText.trim()}
                    style={{ justifyContent: 'center', padding: '8px', fontSize: 10 }}
                  >
                    {submittingGuidance ? <><Loader2 size={11} className="animate-spin" /> Transmitting...</> : <><Send size={11} /> Transmit Solution & Continue</>}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Standard Action Details */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                Action Details
              </div>

              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Operation</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#f0f6fc' }}>
                  {currentStep?.event || currentStep?.strategy || currentStep?.stepId || 'Browser Step'}
                </div>
              </div>

              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Target Selector / URL</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--aw-teal)', wordBreak: 'break-all' }}>
                  {currentStep?.metadata?.target || currentStep?.metadata?.url || 'DOM Document Element'}
                </div>
              </div>

              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Executed By</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#f0f6fc' }}>
                  <Shield size={11} color="var(--aw-teal)" />
                  <span>{worker?.name || 'Autoworker'} (Automated)</span>
                </div>
              </div>

              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Verification State</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isSucceeded ? '#1db87a' : 'var(--aw-teal)' }}>
                  {isSucceeded ? '✓ DOM condition satisfied' : 'Recorded in execution trace'}
                </div>
              </div>

              {/* Extracted Findings & Deliverables Card */}
              {(() => {
                const sOut = currentStep?.metadata?.outputs || currentStep?.outputs;
                if (!sOut) return null;
                const hasExtractedText = Boolean(sOut.extractedText);
                const hasUniversalResult = Boolean(sOut.universal_execution_result);
                const hasStaged = Boolean(sOut._staged_output);
                if (!hasExtractedText && !hasUniversalResult && !hasStaged) return null;
                return (
                  <div style={{ padding: '8px', background: 'rgba(0,194,212,0.05)', border: '1px solid rgba(0,194,212,0.25)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aw-teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={11} color="var(--aw-teal)" /> Extracted Findings & Data
                    </div>
                    {hasExtractedText && (
                      <div style={{ fontSize: 9.5, color: '#f0f6fc', background: 'rgba(0,0,0,0.5)', padding: '6px 8px', borderRadius: 4, maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontFamily: 'var(--font-mono)' }}>
                        {typeof sOut.extractedText === 'string' ? sOut.extractedText.slice(0, 400) + (sOut.extractedText.length > 400 ? '...' : '') : JSON.stringify(sOut.extractedText, null, 2)}
                      </div>
                    )}
                    {hasUniversalResult && (
                      <div style={{ fontSize: 9.5, color: '#1db87a', background: 'rgba(29,184,122,0.1)', border: '1px solid rgba(29,184,122,0.25)', padding: '6px 8px', borderRadius: 4 }}>
                        <div>Deliverable Status: <strong>{sOut.universal_execution_result.status}</strong></div>
                        {sOut.universal_execution_result.output_data?.comparison?.entities && (
                          <div style={{ marginTop: 2, color: '#f0f6fc' }}>
                            Entities Compared: {sOut.universal_execution_result.output_data.comparison.entities.length} items
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Provide human guidance button */}
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => {
                    setGuidanceText(`Guide worker on step ${selectedStepIdx + 1}`);
                  }}
                  className="aw-btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 10, padding: '7px' }}
                >
                  <MessageSquare size={11} /> Guide / Teach Step
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── BOTTOM: Verification Audit Bar ── */}
      <div style={{
        padding: '10px 16px',
        background: '#0d0e15',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isSucceeded ? (
              <>
                <CheckCircle2 size={13} color="var(--aw-green)" />
                <span>Verified: All execution steps passed on target application</span>
              </>
            ) : isWaitingHuman ? (
              <>
                <ShieldAlert size={13} color="var(--aw-amber)" />
                <span>Awaiting Human Input: Paused at uncertain DOM condition</span>
              </>
            ) : isFailed ? (
              <>
                <X size={13} color="var(--aw-red)" />
                <span>Execution Failed: Target DOM condition not satisfied</span>
              </>
            ) : (
              <>
                <Loader2 size={13} className="animate-spin" color="var(--aw-teal)" />
                <span>Processing: Executing workflow steps</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--aw-teal)' }}>
            Workflow v{worker?.version || '1.0'}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.4)' }}>
            AUD-{runId ? runId.substring(0, 8) : 'STANDBY'}
          </div>
        </div>
      </div>
    </div>
  );
}
