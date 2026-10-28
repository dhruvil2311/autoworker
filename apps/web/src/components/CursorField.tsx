/**
 * CursorField — Global cursor interaction system.
 *
 * - Custom minimal dot cursor with trailing ring
 * - Nearby geometry shifts to cursor proximity (CSS-based, no GPU overhead)
 * - Exposes { mouseX, mouseY } as normalized coords for 3D camera
 * - Buttons get subtle depth on hover
 */
import React, { useEffect, useRef, useCallback } from 'react';

interface CursorState {
  x: number;
  y: number;
  normalX: number; // -1 to 1
  normalY: number; // -1 to 1
  hovering: boolean;
}

interface CursorFieldProps {
  onMouseMove?: (normalX: number, normalY: number) => void;
  children?: React.ReactNode;
}

export function CursorField({ onMouseMove, children }: CursorFieldProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100, targetX: -100, targetY: -100 });
  const frameRef = useRef<number>(0);

  const animate = useCallback(() => {
    // Ring lags behind dot for subtle trail effect
    posRef.current.x += (posRef.current.targetX - posRef.current.x) * 0.15;
    posRef.current.y += (posRef.current.targetY - posRef.current.y) * 0.15;

    if (dotRef.current) {
      dotRef.current.style.transform = `translate(${posRef.current.targetX - 4}px, ${posRef.current.targetY - 4}px)`;
    }
    if (ringRef.current) {
      ringRef.current.style.transform = `translate(${posRef.current.x - 16}px, ${posRef.current.y - 16}px)`;
    }

    frameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [animate]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      posRef.current.targetX = e.clientX;
      posRef.current.targetY = e.clientY;

      if (onMouseMove) {
        const normalX = (e.clientX / window.innerWidth - 0.5) * 2;
        const normalY = (e.clientY / window.innerHeight - 0.5) * 2;
        onMouseMove(normalX, normalY);
      }
    };

    const handleOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, [data-interactive]');

      if (dotRef.current) {
        dotRef.current.style.width = isInteractive ? '16px' : '8px';
        dotRef.current.style.height = isInteractive ? '16px' : '8px';
        dotRef.current.style.opacity = isInteractive ? '0.4' : '1';
      }
      if (ringRef.current) {
        ringRef.current.style.width = isInteractive ? '48px' : '32px';
        ringRef.current.style.height = isInteractive ? '48px' : '32px';
        ringRef.current.style.borderColor = isInteractive
          ? 'rgba(0, 217, 245, 0.6)'
          : 'rgba(0, 217, 245, 0.3)';
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseover', handleOver, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseover', handleOver);
    };
  }, [onMouseMove]);

  return (
    <>
      {/* Cursor elements — fixed above everything */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 8,
          height: 8,
          background: 'var(--aw-teal)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'screen',
          transition: 'width 0.15s ease, height 0.15s ease, opacity 0.15s ease',
          willChange: 'transform',
        }}
      />
      <div
        ref={ringRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 32,
          height: 32,
          border: '1px solid rgba(0, 217, 245, 0.3)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 9998,
          transition: 'width 0.2s ease, height 0.2s ease, border-color 0.3s ease',
          willChange: 'transform',
        }}
      />

      {children}
    </>
  );
}

/**
 * Hook to use cursor position anywhere in the tree.
 * Returns normalized [-1, 1] coordinates.
 */
export function useCursorPosition() {
  const ref = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      ref.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      ref.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handle, { passive: true });
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  return ref;
}
