import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type WorkspaceState = 'idle' | 'thinking' | 'working' | 'needs-you' | 'success';

interface Props {
  state?: WorkspaceState;
  size?: number;
  className?: string;
}

export function DigitalWorkspace3D({ state = 'idle', size = 300, className = '' }: Props) {
  const isAttention = state === 'needs-you';
  const isWorking = state === 'working';
  const isThinking = state === 'thinking';
  
  // Base 3D rotation for the isometric desk feel
  const baseRotateX = 60;
  const baseRotateZ = -45;

  const containerVariants = {
    idle: { rotateX: baseRotateX, rotateZ: baseRotateZ, scale: 1 },
    thinking: { rotateX: baseRotateX, rotateZ: baseRotateZ, scale: 1.05, y: -10 },
    working: { rotateX: 55, rotateZ: -40, scale: 1 },
    'needs-you': { rotateX: 65, rotateZ: -50, scale: 1.1, y: -20 },
    success: { rotateX: baseRotateX, rotateZ: baseRotateZ, scale: 1 }
  };

  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: '1200px' }}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        variants={containerVariants}
        initial="idle"
        animate={state}
        transition={{ type: "spring", stiffness: 60, damping: 20 }}
      >
        
        {/* The Desk / Base Plate */}
        <motion.div 
          className="absolute inset-10 rounded-3xl backdrop-blur-md shadow-2xl transition-colors duration-700"
          style={{ 
            transform: 'translateZ(0px)',
            background: isAttention ? 'rgba(232, 148, 42, 0.05)' : isWorking ? 'rgba(0, 194, 212, 0.03)' : 'rgba(14, 14, 20, 0.5)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: isAttention ? '0 20px 50px rgba(232, 148, 42, 0.15)' : isWorking ? '0 20px 50px rgba(0, 194, 212, 0.1)' : 'none'
          }}
        >
           {/* Grid Lines */}
           <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] rounded-3xl" />
        </motion.div>

        {/* Browser Window / Active Screen */}
        <motion.div
          className="absolute top-[20%] left-[20%] right-[20%] bottom-[20%] rounded-xl flex flex-col overflow-hidden backdrop-blur-xl transition-colors duration-700"
          style={{ 
            transform: 'translateZ(60px)',
            background: isAttention ? 'rgba(17, 17, 17, 0.9)' : isWorking ? 'rgba(10, 10, 10, 0.9)' : 'rgba(20, 20, 29, 0.8)',
            border: isAttention ? '1px solid var(--aw-amber)' : isWorking ? '1px solid rgba(0, 194, 212, 0.5)' : '1px solid rgba(255,255,255,0.07)',
            boxShadow: isAttention ? '0 0 30px rgba(232, 148, 42, 0.2)' : isWorking ? '0 0 30px rgba(0, 194, 212, 0.2)' : 'none'
          }}
          animate={{
             translateZ: isWorking ? 80 : isAttention ? 100 : 60,
             y: isThinking ? -10 : 0
          }}
          transition={{ type: "spring", stiffness: 80, damping: 15 }}
        >
          {/* Browser Header */}
          <div className="h-6 flex items-center px-3 gap-1.5 shrink-0" style={{ background: 'rgba(26, 26, 38, 1)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
             <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
             <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
             <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          </div>
          {/* Browser Content */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
             
             {/* Working State Visuals */}
             <AnimatePresence>
                {isWorking && (
                   <motion.div 
                     initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                     className="absolute inset-0 flex flex-col p-4 gap-3"
                   >
                     <motion.div className="h-4 w-3/4 rounded" style={{ background: 'rgba(0, 194, 212, 0.2)', border: '1px solid rgba(0, 194, 212, 0.3)' }} animate={{ width: ["0%", "75%"] }} transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }} />
                     <div className="flex gap-2">
                        <motion.div className="h-10 w-10 rounded" style={{ background: 'rgba(0, 194, 212, 0.1)', border: '1px solid rgba(0, 194, 212, 0.2)' }} />
                        <div className="flex-1 flex flex-col gap-2">
                           <motion.div className="h-2 w-full rounded" style={{ background: 'rgba(0, 194, 212, 0.1)' }} />
                           <motion.div className="h-2 w-4/5 rounded" style={{ background: 'rgba(0, 194, 212, 0.1)' }} />
                        </div>
                     </div>
                   </motion.div>
                )}
             </AnimatePresence>

             {/* Thinking State Visuals */}
             <AnimatePresence>
                {isThinking && (
                   <motion.div 
                     initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                     className="absolute inset-0 flex items-center justify-center"
                   >
                     <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(0, 194, 212, 0.2)', borderTopColor: 'var(--aw-teal)' }} />
                   </motion.div>
                )}
             </AnimatePresence>

             {/* Attention State Visuals */}
             <AnimatePresence>
                {isAttention && (
                   <motion.div 
                     initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                     className="absolute inset-0 flex flex-col items-center justify-center"
                     style={{ background: 'rgba(232, 148, 42, 0.1)' }}
                   >
                     <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs mb-2 animate-pulse" style={{ background: 'rgba(232, 148, 42, 0.2)', border: '1px solid var(--aw-amber)', color: 'var(--aw-amber)' }}>!</div>
                     <div className="h-1.5 w-1/2 rounded" style={{ background: 'rgba(232, 148, 42, 0.5)' }} />
                   </motion.div>
                )}
             </AnimatePresence>

          </div>
        </motion.div>

        {/* Floating Data Fragments / Documents (Only show during working/thinking) */}
        <AnimatePresence>
           {(isWorking || isThinking) && (
              <>
                 <motion.div 
                   initial={{ opacity: 0, translateZ: 0, x: -20, y: 20 }}
                   animate={{ opacity: 1, translateZ: 40, x: -40, y: -30, rotateZ: -15 }}
                   exit={{ opacity: 0, translateZ: 0 }}
                   className="absolute top-[30%] left-[10%] w-16 h-20 rounded shadow-xl backdrop-blur-md flex flex-col p-2 gap-1.5"
                   style={{ background: 'rgba(26, 26, 38, 0.8)', border: '1px solid rgba(0, 194, 212, 0.3)' }}
                   transition={{ type: "spring", stiffness: 50 }}
                 >
                    <div className="h-1 w-full rounded" style={{ background: 'rgba(0, 194, 212, 0.4)' }} />
                    <div className="h-1 w-4/5 rounded" style={{ background: 'rgba(0, 194, 212, 0.4)' }} />
                    <div className="h-1 w-5/6 rounded" style={{ background: 'rgba(0, 194, 212, 0.4)' }} />
                 </motion.div>
                 
                 <motion.div 
                   initial={{ opacity: 0, translateZ: 0, x: 20, y: -20 }}
                   animate={{ opacity: 1, translateZ: 90, x: 50, y: 30, rotateZ: 25 }}
                   exit={{ opacity: 0, translateZ: 0 }}
                   className="absolute bottom-[30%] right-[10%] w-20 h-14 rounded shadow-xl backdrop-blur-md flex items-center justify-center"
                   style={{ background: 'rgba(26, 26, 38, 0.8)', border: '1px solid rgba(0, 194, 212, 0.3)' }}
                   transition={{ type: "spring", stiffness: 40, delay: 0.1 }}
                 >
                    <div className="w-8 h-8 rounded-full border-2 border-dashed animate-spin-slow" style={{ borderColor: 'rgba(0, 194, 212, 0.2)' }} />
                 </motion.div>
              </>
           )}
        </AnimatePresence>

        {/* Ambient Glow */}
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] rounded-full blur-[60px] pointer-events-none transition-colors duration-700 mix-blend-screen"
          style={{ 
            transform: 'translateZ(-50px)',
            background: isAttention ? 'rgba(232, 148, 42, 0.15)' : isWorking ? 'rgba(0, 194, 212, 0.1)' : 'transparent'
          }}
        />

      </motion.div>
    </div>
  );
}
