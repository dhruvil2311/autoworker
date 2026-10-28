import React, { useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface ComputerSetupProps {
  uiElement?: React.ReactNode | undefined;
  overlayElement?: React.ReactNode | undefined;
  isActive?: boolean | undefined;
  isAmber?: boolean | undefined;
  isGreen?: boolean | undefined;
}

export function ComputerSetup({
  uiElement,
  overlayElement,
  isActive = false,
  isAmber = false,
  isGreen = false
}: ComputerSetupProps) {
  const screenLightRef = useRef<THREE.RectAreaLight>(null);

  useFrame((state, delta) => {
    if (screenLightRef.current) {
      if (isActive) {
        let targetColor = new THREE.Color('#e0e8f5');
        if (isAmber) targetColor = new THREE.Color('#e8942a');
        if (isGreen) targetColor = new THREE.Color('#1db87a');
        
        screenLightRef.current.color.lerp(targetColor, delta * 4);
        screenLightRef.current.intensity = THREE.MathUtils.lerp(
          screenLightRef.current.intensity, 
          2.5 + Math.sin(state.clock.elapsedTime * 2.5) * 0.35, 
          delta * 4
        );
      } else {
        screenLightRef.current.intensity = THREE.MathUtils.lerp(screenLightRef.current.intensity, 0.4, delta * 4);
      }
    }
  });

  return (
    <group position={[0, 3.05, -0.5]}>
      {/* ── Heavy Duty Dual Monitor Arm (Brushed Gunmetal) ── */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.06, 0.7]} />
        <meshStandardMaterial color="#0b0b10" roughness={0.5} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.6, 16]} />
        <meshStandardMaterial color="#1e1e26" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.3, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 0.12, 0.12]} />
        <meshStandardMaterial color="#121218" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* ── Primary Curved 32" IPS Display (Left/Center) ── */}
      <group position={[-1.9, 1.3, 0.2]} rotation={[0, 0.08, 0]}>
        {/* Monitor Bezel */}
        <mesh receiveShadow castShadow>
          <boxGeometry args={[3.6, 2.1, 0.1]} />
          <meshStandardMaterial color="#101015" roughness={0.6} metalness={0.5} />
        </mesh>
        
        {/* Screen Surface */}
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[3.5, 2.0]} />
          <meshStandardMaterial 
            color="#ffffff" 
            emissive={isAmber ? '#e8942a' : isGreen ? '#1db87a' : isActive ? '#141a24' : '#08080c'} 
            emissiveIntensity={isActive ? 0.35 : 0.05} 
            roughness={0.15} 
            metalness={0.2} 
          />
          
          {/* Mount UI on screen */}
          {uiElement && (
            <Html transform position={[0, 0, 0.01]} scale={0.105} occlude zIndexRange={[100, 0]}>
              {uiElement}
            </Html>
          )}
        </mesh>

        {/* Screen Light Projection */}
        <rectAreaLight ref={screenLightRef} width={3.5} height={2} intensity={0.5} color="#e0e8f5" position={[0, 0, 0.1]} />

        {/* State Overlay */}
        {overlayElement && (
          <Html transform position={[0, 0, 0.25]} scale={0.14} distanceFactor={1.8} zIndexRange={[140, 0]}>
            {overlayElement}
          </Html>
        )}
      </group>

      {/* ── Secondary 27" Portrait Display (Right) ── */}
      <group position={[1.9, 1.3, 0.4]} rotation={[0, -0.22, 0]}>
        {/* Bezel */}
        <mesh receiveShadow castShadow>
          <boxGeometry args={[2.1, 3.6, 0.1]} />
          <meshStandardMaterial color="#101015" roughness={0.6} metalness={0.5} />
        </mesh>
        
        {/* Screen Surface */}
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[2.0, 3.5]} />
          <meshStandardMaterial color="#0a0b0e" emissive={isActive ? '#080e18' : '#000'} roughness={0.15} metalness={0.2} />
          
          {/* Real Agent Telemetry / Memory Stream */}
          <Html transform position={[0, 0, 0.01]} scale={0.105} occlude>
            <div style={{ width: '480px', height: '800px', background: '#090a0f', color: '#6e7681', padding: '24px 20px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', lineHeight: 1.6 }}>
              <div style={{ color: '#58a6ff', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginBottom: '12px' }}>
                $ autoworker-runtime --session=active
              </div>
              <div style={{ color: '#8b949e' }}>[SYSTEM] runtime.init(kernel=v3.8)</div>
              <div style={{ color: '#8b949e' }}>[PLAYWRIGHT] browser_session_attached (pid=4991)</div>
              <div style={{ color: '#8b949e' }}>[DOM] parsing tree: 1,420 nodes indexed</div>
              {isActive && (
                <>
                  <div style={{ color: '#00c2d4', marginTop: '12px' }}>[EXEC] Action: navigate_and_click('#btn-order-992')</div>
                  <div style={{ color: '#00c2d4' }}>[STATE] rule_evaluator: match_confidence = 0.994</div>
                  <div style={{ color: isAmber ? '#e8942a' : '#8b949e', marginTop: '8px' }}>
                    {isAmber ? '[ATTENTION] Uncertainty: Dropdown mismatch on line 2' : '[STATUS] Heartbeat: OK · Memory load: 18%'}
                  </div>
                  {isGreen && (
                    <div style={{ color: '#1db87a', marginTop: '12px', fontWeight: 600 }}>
                      [SUCCESS] Workflow completed in 420ms. Verified.
                    </div>
                  )}
                </>
              )}
            </div>
          </Html>
        </mesh>
      </group>
    </group>
  );
}
