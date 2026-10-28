import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const maxWidthStyles = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#07080c]/80 backdrop-blur-md"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className={`relative w-full ${maxWidthStyles[maxWidth]} bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10`}
          >
            {/* Header */}
            {(title || subtitle) && (
              <div className="flex items-start justify-between p-5 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0d13]/50 shrink-0">
                <div>
                  {title && (
                    <h3 className="text-base font-semibold text-[#f4f2ee] tracking-tight font-display">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-xs text-[#8e92a4] mt-1 leading-relaxed">{subtitle}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  aria-label="Close dialog"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Scrollable Content Container */}
            <div className="p-5 overflow-y-auto flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
