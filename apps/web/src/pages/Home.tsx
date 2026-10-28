import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, Building2, Layers, GraduationCap, BookOpen, Sparkles } from 'lucide-react';
import { useAuth } from '../components/AuthContext.js';
import { DigitalEnvironment } from '../components/landing/DigitalEnvironment.js';
import { BrandLogo } from '../components/ui/BrandLogo.js';

// ── Exact 6-Chapter Spatial Narrative Storyboard ────────────────────────────
const CHAPTERS = [
  {
    min: 0.00,
    max: 0.15,
    chapter: '01',
    label: 'RECEPTION / ORIENTATION',
    title: 'HIRE WORK THAT LEARNS.',
    body: 'Teach a digital worker how your business works. It learns the process, performs the work, asks when uncertain, and improves from your corrections.',
    icon: Building2,
    scrollTarget: 0.0,
  },
  {
    min: 0.15,
    max: 0.32,
    chapter: '02',
    label: 'OPERATIONS BAY',
    title: 'AUTONOMOUS ENTERPRISE EXECUTION.',
    body: 'Digital workers sit at physical workstations in designated departments. They navigate live ERPs, databases, and warehouse queues without brittle API scripts.',
    icon: Layers,
    scrollTarget: 0.24,
  },
  {
    min: 0.32,
    max: 0.50,
    chapter: '03',
    label: 'AT THE WORKSTATION',
    title: 'NATIVE SOFTWARE NAVIGATION.',
    body: 'Watch the worker log into Apex ERP, inspect wholesale order #48219, and detect a 4-unit inventory deficit across multi-facility warehouse stock.',
    icon: Layers,
    scrollTarget: 0.42,
  },
  {
    min: 0.50,
    max: 0.68,
    chapter: '04',
    label: 'TEACHING STATION',
    title: 'WHEN IT IS UNSURE, IT ASKS.',
    body: 'A transfer button is nested under a new menu. Rather than hallucinating or breaking, the worker halts safely and requests human supervisor guidance.',
    icon: GraduationCap,
    scrollTarget: 0.58,
  },
  {
    min: 0.68,
    max: 0.84,
    chapter: '05',
    label: 'EVIDENCE & MEMORY',
    title: 'YOUR GUIDANCE BECOMES PERMANENT.',
    body: 'You instruct: “Open More Actions dropdown first.” The procedural SOP compiles from v1.0 to v2.0. The worker commits the rule and never makes the mistake again.',
    icon: BookOpen,
    scrollTarget: 0.76,
  },
  {
    min: 0.84,
    max: 1.00,
    chapter: '06',
    label: 'DIGITAL HEADQUARTERS',
    title: 'THE DIGITAL WORKPLACE IS READY.',
    body: 'Orchestrate autonomous digital employees across Operations, Finance, and Customer Ops that compound organizational capability over time.',
    icon: Sparkles,
    scrollTarget: 0.96,
  },
];

export function Home() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const primaryCtaTarget = session ? '/workforce' : '/login';

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const [chapterIndex, setChapterIndex] = useState(0);

  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      const idx = CHAPTERS.findIndex((ch) => v >= ch.min && v <= ch.max);
      if (idx !== -1) {
        setChapterIndex((prev) => (prev !== idx ? idx : prev));
      }
    });
  }, [scrollYProgress]);

  // Resolve current active spatial chapter
  const activeChapter = CHAPTERS[chapterIndex] || CHAPTERS[0]!;

  const handleJumpToChapter = (targetProgress: number) => {
    if (!containerRef.current) return;
    const totalHeight = containerRef.current.scrollHeight - window.innerHeight;
    window.scrollTo({
      top: targetProgress * totalHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative min-h-screen bg-[#07080c] text-[#f4f2ee] select-none">
      {/* ── 1. Minimalist Architectural Navigation Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-3.5 bg-[#080a0e]/90 backdrop-blur-md border-b border-white/[0.07]">
        <Link to="/" className="flex items-center text-[#f4f2ee] hover:text-white transition-opacity group no-underline">
          <BrandLogo variant="nav" />
        </Link>

        {/* In-Tour Chapter Jumps */}
        <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-full p-1 shadow-inner">
          {CHAPTERS.map((ch, idx) => {
            const isActive = idx === chapterIndex;
            return (
              <button
                key={ch.chapter}
                onClick={() => handleJumpToChapter(ch.scrollTarget)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                    : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                }`}
              >
                {ch.label.split(' / ')[0]}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(primaryCtaTarget)}
            className="flex items-center gap-2 px-4 py-2 bg-[#f4f2ee] hover:bg-white text-[#080a0e] font-semibold text-xs rounded transition-all cursor-pointer shadow-md hover:shadow-lg"
          >
            <span>Enter Headquarters</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* ── 2. The Guided Office Tour (Sticky 3D Scene + Scroll Timeline) ── */}
      <div ref={containerRef} className="relative h-[700vh]">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* 3D Office World (Identical to HQ environment) */}
          <DigitalEnvironment scrollProgress={scrollYProgress} />

          {/* ── 3. Editorial Narrative Layer in Negative Space ── */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between px-10 py-24 md:py-28">
            {/* Top Chapter Story Card in Left Architectural Margin */}
            <div className="max-w-[540px] pointer-events-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`chapter-${activeChapter.chapter}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="bg-[#090b10]/85 backdrop-blur-md p-6 rounded-lg border border-white/[0.09] shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold tracking-widest text-[#60a5fa] uppercase">
                      CHAPTER {activeChapter.chapter} / 06 · {activeChapter.label}
                    </span>
                  </div>

                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#f4f2ee] leading-tight mb-3">
                    {activeChapter.title}
                  </h1>

                  <p className="text-sm text-[#c4c7d4] leading-relaxed mb-5">
                    {activeChapter.body}
                  </p>

                  <div className="flex items-center gap-3 pt-3 border-t border-white/[0.08]">
                    <button
                      onClick={() => navigate(primaryCtaTarget)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#f4f2ee] hover:bg-white text-[#080a0e] font-semibold text-xs rounded transition-all cursor-pointer shadow-sm hover:shadow"
                    >
                      <span>Enter Autoworker HQ</span>
                      <ArrowRight size={13} />
                    </button>

                    <button
                      onClick={() =>
                        handleJumpToChapter(
                          CHAPTERS[Math.min(CHAPTERS.length - 1, chapterIndex + 1)]!.scrollTarget
                        )
                      }
                      className="px-3 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-xs text-[#8e92a4] hover:text-[#f4f2ee] rounded transition-colors cursor-pointer"
                    >
                      Next Chapter →
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom Scroll Cue & Office World Telemetry */}
            <div className="flex items-end justify-between pointer-events-auto">
              <div className="flex items-center gap-3 bg-[#080a0e]/85 backdrop-blur-md px-4 py-2 rounded border border-white/[0.08]">
                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[11px] font-mono text-[#8e92a4]">
                  AUTOWORKER DIGITAL OPERATIONS WORKPLACE · ENTERPRISE OPERATIONS HQ
                </span>
              </div>

              <div className="flex items-center gap-2 bg-[rgba(8,10,14,0.7)] backdrop-blur-md px-4 py-2 rounded border border-[rgba(255,255,255,0.06)] text-xs text-[#8e92a4]">
                <span>SCROLL TO WALK THROUGH DEPARTMENTS</span>
                <ChevronDown size={13} className="animate-bounce" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
