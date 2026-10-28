import React from 'react';
import { Canvas } from '@react-three/fiber';
import { AutoworkerCoreScene } from './AutoworkerCore.js';

class WebGLErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--aw-coolgray)' }}>
          Core unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

export type WorkCoreState = 
  | 'DORMANT'
  | 'EVIDENCE'
  | 'UNDERSTANDING'
  | 'WORKING'
  | 'NEEDS_HELP'
  | 'CORRECTION'
  | 'SUCCESS'
  | 'FAILED';

interface WorkCore3DProps {
  state: WorkCoreState;
  className?: string;
  hideBloom?: boolean;
}

export function WorkCore3D({ state, className = '', hideBloom = false }: WorkCore3DProps) {
  return (
    <div className={`w-full h-full relative ${className}`}>
      <WebGLErrorBoundary>
        <Canvas
          camera={{ position: [0, 0.08, 4.6], fov: 42, near: 0.1, far: 40 }}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }}
          dpr={hideBloom ? [1, 1] : [1, 1.5]}
          frameloop="always"
        >
          <ambientLight intensity={0.08} color="#11121a" />
          <directionalLight position={[-3, 4, 3]} intensity={0.9} color="#d7dde2" />
          <directionalLight position={[3, -2, 2]} intensity={0.18} color="#0b1520" />
          <group scale={0.95}>
            <AutoworkerCoreScene state={state} />
          </group>
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
