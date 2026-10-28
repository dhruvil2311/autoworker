import React from 'react';
import { Environment } from '@react-three/drei';

export function LightingSystem() {
  return (
    <>
      {/* City environment for subtle reflections on glass, metal, stone and polished walnut */}
      <Environment preset="city" environmentIntensity={0.4} />

      {/* Base Warm-Neutral Ambient Illumination (inviting, warm, natural) */}
      <ambientLight intensity={0.72} color="#fff8ee" />

      {/* Primary Architectural Key Light (Soft Warm Daylight) */}
      <directionalLight 
        position={[6, 12, 6]} 
        intensity={1.6} 
        color="#fff5ea" 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      >
        <orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20, 0.1, 35]} />
      </directionalLight>
      
      {/* Natural Daylight Stream from East Window Wall (Finance Wing) */}
      <directionalLight 
        position={[14, 6, 0]} 
        intensity={1.1} 
        color="#eaf2fc" 
        castShadow={false} 
      />

      {/* Natural Daylight Stream from West Window Wall (Operations Wing) */}
      <directionalLight 
        position={[-14, 6, 0]} 
        intensity={1.1} 
        color="#eaf2fc" 
        castShadow={false} 
      />

      {/* Focused Warm Task Light on Hero Workstation (y = 1.3m) */}
      <pointLight 
        position={[-0.7, 1.3, -0.2]} 
        intensity={0.9} 
        distance={3.5} 
        color="#fff0d6" 
      />

      {/* Focused Neutral Task Light on Operations Dispatch Desk */}
      <pointLight 
        position={[-12.5, 1.4, 0.8]} 
        intensity={0.8} 
        distance={4.0} 
        color="#e8f2fa" 
      />

      {/* Focused Warm Task Light on Finance Desk */}
      <pointLight 
        position={[12.5, 1.4, 0.8]} 
        intensity={0.8} 
        distance={4.0} 
        color="#fff2db" 
      />

      {/* Collaborative Lighting in Meeting Room */}
      <pointLight 
        position={[-9.5, 2.2, 12.5]} 
        intensity={0.9} 
        distance={5.0} 
        color="#fff5e8" 
      />

      {/* Corridor Warm Fill */}
      <pointLight 
        position={[0, 2.6, 5.5]} 
        intensity={0.6} 
        distance={8.0} 
        color="#fff3df" 
      />
    </>
  );
}
