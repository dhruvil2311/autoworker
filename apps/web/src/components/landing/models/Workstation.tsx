import React from 'react';
import * as THREE from 'three';

export interface WorkstationProps {
  position?: [number, number, number] | undefined;
  rotation?: [number, number, number] | undefined;
  label?: string | undefined;
  isActive?: boolean | undefined;
  isAmber?: boolean | undefined;
  isGreen?: boolean | undefined;
  isHuman?: boolean | undefined;
  hideSetup?: boolean | undefined;
  uiElement?: React.ReactNode | undefined;
}

export function Workstation({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  isActive = false,
  isAmber = false,
  isGreen = false,
  hideSetup = false,
}: WorkstationProps) {
  const accentColor = isAmber ? '#e8942a' : isGreen ? '#1db87a' : isActive ? '#00c2d4' : '#505060';

  return (
    <group position={position} rotation={rotation}>
      {/* ── 1. SOLID AMERICAN WALNUT EXECUTIVE DESK (Top at y = 0.75m) ── */}
      <mesh position={[0, 0.735, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.1, 0.038, 0.95]} />
        <meshStandardMaterial 
          color="#342116" 
          roughness={0.42} 
          metalness={0.06} 
        />
      </mesh>

      {/* Desktop Under-Bevel */}
      <mesh position={[0, 0.71, 0]} receiveShadow>
        <boxGeometry args={[2.06, 0.015, 0.91]} />
        <meshStandardMaterial color="#1a110a" roughness={0.6} />
      </mesh>

      {/* Architectural Steel A-Frame Leg Structures */}
      <group position={[0, 0.355, 0]}>
        <mesh position={[-0.92, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.71, 0.8]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[-0.92, -0.34, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.07, 0.025, 0.86]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>

        <mesh position={[0.92, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.71, 0.8]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[0.92, -0.34, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.07, 0.025, 0.86]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>

        {/* Crossbeam */}
        <mesh position={[0, 0.24, -0.22]} castShadow receiveShadow>
          <boxGeometry args={[1.65, 0.06, 0.14]} />
          <meshStandardMaterial color="#0e0f13" roughness={0.8} />
        </mesh>
      </group>

      {/* ── 2. ERGONOMIC EXECUTIVE CHAIR (Seat at y = 0.46m) ── */}
      <group position={[0, 0, 0.55]} rotation={[0, Math.PI, 0]}>
        <group position={[0, 0.03, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.04, 16]} />
            <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
          </mesh>
          {[0, 72, 144, 216, 288].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <group key={`leg-${i}`} rotation={[0, rad, 0]}>
                <mesh position={[0.16, 0, 0]} rotation={[0, 0, -0.05]} castShadow>
                  <boxGeometry args={[0.28, 0.015, 0.02]} />
                  <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
                </mesh>
                <mesh position={[0.29, -0.015, 0]} castShadow>
                  <sphereGeometry args={[0.015, 12, 12]} />
                  <meshStandardMaterial color="#121316" roughness={0.6} />
                </mesh>
              </group>
            );
          })}
        </group>

        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.018, 0.38, 16]} />
          <meshStandardMaterial color="#181920" roughness={0.3} metalness={0.9} />
        </mesh>

        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 0.05, 0.46]} />
          <meshStandardMaterial color="#1c1d24" roughness={0.92} />
        </mesh>

        <group position={[0, 0.72, 0.2]}>
          <mesh rotation={[-0.08, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.48, 0.03]} />
            <meshStandardMaterial color="#191a20" roughness={0.94} />
          </mesh>
          <mesh position={[0, -0.05, 0.025]} castShadow>
            <boxGeometry args={[0.06, 0.42, 0.025]} />
            <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
          </mesh>
        </group>

        {[-0.26, 0.26].map((x, i) => (
          <group key={`arm-${i}`} position={[x, 0.58, 0.02]}>
            <mesh position={[0, 0, 0]} castShadow>
              <boxGeometry args={[0.02, 0.18, 0.03]} />
              <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
            </mesh>
            <mesh position={[0, 0.09, 0.02]} castShadow>
              <boxGeometry args={[0.06, 0.015, 0.2]} />
              <meshStandardMaterial color="#14151a" roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── 3. MONITOR ARMS ── */}
      <group position={[0, 0.755, -0.36]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.12, 0.04, 0.08]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.4, 16]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        <group position={[0, 0.32, 0]} rotation={[0, -0.3, 0]}>
          <mesh position={[-0.22, 0, 0.06]} castShadow>
            <boxGeometry args={[0.44, 0.025, 0.025]} />
            <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
          </mesh>
        </group>
        <group position={[0, 0.32, 0]} rotation={[0, 0.3, 0]}>
          <mesh position={[0.22, 0, 0.06]} castShadow>
            <boxGeometry args={[0.44, 0.025, 0.025]} />
            <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
          </mesh>
        </group>
      </group>

      {/* ── 4. DUAL MONITORS ── */}
      {!hideSetup && (
        <group position={[0, 0.75, 0]}>
          {/* Left Screen */}
          <group position={[-0.34, 0.32, -0.16]} rotation={[0, 0.12, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.62, 0.38, 0.015]} />
              <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
            </mesh>
            <mesh position={[0, 0, 0.009]}>
              <planeGeometry args={[0.60, 0.36]} />
              <meshStandardMaterial 
                color={isActive ? '#141a29' : '#0e121a'} 
                emissive={isActive ? accentColor : '#182032'}
                emissiveIntensity={isActive ? 0.35 : 0.15}
                roughness={0.15} 
                metalness={0.1} 
                toneMapped={false}
              />
            </mesh>
          </group>

          {/* Right Screen */}
          <group position={[0.34, 0.32, -0.16]} rotation={[0, -0.12, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.62, 0.38, 0.015]} />
              <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
            </mesh>
            <mesh position={[0, 0, 0.009]}>
              <planeGeometry args={[0.60, 0.36]} />
              <meshStandardMaterial 
                color={isActive ? '#141a29' : '#0e121a'} 
                emissive={isActive ? accentColor : '#182032'}
                emissiveIntensity={isActive ? 0.35 : 0.15}
                roughness={0.15} 
                metalness={0.1} 
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      )}

      {/* ── 5. DESK MAT & PERIPHERALS ── */}
      <mesh position={[0, 0.756, 0.08]} receiveShadow>
        <boxGeometry args={[0.92, 0.003, 0.42]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.85} metalness={0.08} />
      </mesh>

      <group position={[-0.08, 0.76, 0.12]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.008, 0.13]} />
          <meshStandardMaterial color="#16171d" roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[0.34, 0.004, 0.11]} />
          <meshStandardMaterial color="#252732" roughness={0.7} />
        </mesh>
      </group>

      <group position={[0.3, 0.76, 0.12]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.07, 0.012, 0.11]} />
          <meshStandardMaterial color="#1c1e26" roughness={0.4} metalness={0.3} />
        </mesh>
      </group>

      {/* Accessories */}
      {!hideSetup && (
        <>
          <group position={[-0.78, 0.755, 0.05]} rotation={[0, 0.2, 0]}>
            <mesh position={[0, 0.03, 0]} rotation={[-0.2, 0, 0]} castShadow>
              <boxGeometry args={[0.26, 0.01, 0.2]} />
              <meshStandardMaterial color="#2d2f38" roughness={0.3} metalness={0.85} />
            </mesh>
            <mesh position={[0, 0.06, 0]} rotation={[-0.2, 0, 0]} castShadow>
              <boxGeometry args={[0.3, 0.008, 0.21]} />
              <meshStandardMaterial color="#242630" roughness={0.3} metalness={0.85} />
            </mesh>
            <group position={[0, 0.08, -0.1]} rotation={[-0.45, 0, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.3, 0.2, 0.006]} />
                <meshStandardMaterial color="#16171e" roughness={0.3} metalness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.004]}>
                <planeGeometry args={[0.28, 0.18]} />
                <meshBasicMaterial color="#0c1017" />
              </mesh>
            </group>
          </group>

          <group position={[0.62, 0.756, 0.1]} rotation={[0, -0.1, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.16, 0.01, 0.22]} />
              <meshStandardMaterial color="#2d2b38" roughness={0.85} />
            </mesh>
          </group>

          <group position={[0.82, 0.756, 0.18]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.045, 0.04, 0.008, 20]} />
              <meshStandardMaterial color="#dedad2" roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.024, 0]} castShadow>
              <cylinderGeometry args={[0.026, 0.02, 0.04, 20]} />
              <meshStandardMaterial color="#dedad2" roughness={0.35} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
