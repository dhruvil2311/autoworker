import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const widthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#07080c]/70 backdrop-blur-sm"
          />

          {/* Drawer Slide-in Panel */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className={`pointer-events-auto w-screen ${widthStyles[width]} bg-[#0e1017] border-l border-[rgba(255,255,255,0.08)] shadow-2xl flex flex-col`}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0d13]/50 shrink-0">
                <div>
                  {title && (
                    <h3 className="text-sm font-semibold text-[#f4f2ee] tracking-tight font-display">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-xs text-[#8e92a4] mt-0.5">{subtitle}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  aria-label="Close drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scroll Container */}
              <div className="flex-1 overflow-y-auto p-4">{children}</div>

              {/* Footer */}
              {footer && (
                <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-[#0b0d13]/50 shrink-0">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
