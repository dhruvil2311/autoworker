import React from 'react';
import * as THREE from 'three';
import { CitySkyline } from './CitySkyline.js';

/**
 * Commercial Architectural Envelope (Scale: 1 unit = 1 meter)
 * Standard dimensions:
 * - Ceiling height: 4.2m (giving generous commercial headroom)
 * - Floor at y = 0
 * - Desk height: 0.74m
 * - Human eye level: 1.6m - 1.8m
 * - Wall thickness: 0.30m
 */
function createEuropeanOakFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Natural European White Oak base tone
  ctx.fillStyle = '#baa896';
  ctx.fillRect(0, 0, 512, 512);

  const plankCount = 16;
  const plankH = 512 / plankCount;
  const tones = ['#baa896', '#b4a18f', '#c2b09f', '#ad9a87', '#bfad9c'];

  for (let i = 0; i < plankCount; i++) {
    const y = i * plankH;
    ctx.fillStyle = tones[i % tones.length]!;
    ctx.fillRect(0, y, 512, plankH - 1.5);

    // Subtle grain lines
    ctx.fillStyle = 'rgba(120, 100, 80, 0.08)';
    for (let g = 0; g < 4; g++) {
      ctx.fillRect(0, y + 4 + g * 6, 512, 1);
    }

    // Plank seam / bevel line
    ctx.fillStyle = 'rgba(70, 55, 42, 0.25)';
    ctx.fillRect(0, y + plankH - 1.5, 512, 1.5);

    // Vertical plank end joints
    const jointX1 = (i * 137) % 512;
    const jointX2 = (i * 283) % 512;
    ctx.fillRect(jointX1, y, 1.5, plankH);
    ctx.fillRect(jointX2, y, 1.5, plankH);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.anisotropy = 8;
  return tex;
}

export function OfficeEnvironment() {
  const oakTexture = React.useMemo(() => createEuropeanOakFloorTexture(), []);

  return (
    <group>
      {/* ══════════════════════════════════════════════════════════════════
          0. PROCEDURAL 3D METROPOLITAN CITY SKYLINE & TERRACE
          ══════════════════════════════════════════════════════════════════ */}
      <CitySkyline />

      {/* ══════════════════════════════════════════════════════════════════
          1. FLOORING SYSTEM — EUROPEAN WHITE OAK & ACOUSTIC WOVEN RUGS
          ══════════════════════════════════════════════════════════════════ */}
      {/* Natural European White Oak Architectural Plank Main Floor */}
      <mesh position={[0, -0.002, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[64, 48]} />
        <meshStandardMaterial 
          map={oakTexture}
          roughness={0.65} 
          metalness={0.05} 
        />
      </mesh>

      {/* Honed Italian Travertine Central Gallery Walkway */}
      <mesh position={[0, -0.001, 3.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.4, 24]} />
        <meshStandardMaterial
          color="#dcd5c9"
          roughness={0.7}
          metalness={0.06}
        />
      </mesh>
      {/* Champagne Bronze Inlay Trim Rails */}
      {[-2.2, 2.2].map((x, i) => (
        <mesh key={`trim-${i}`} position={[x, 0.0005, 3.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, 24]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      ))}

      {/* ── Main Central Executive Zone Acoustic Woven Carpet ── */}
      <group position={[0, 0.002, -0.6]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[5.8, 6.2]} />
          <meshStandardMaterial 
            color="#2a2e3a" 
            roughness={0.92} 
            metalness={0.02} 
          />
        </mesh>
        {/* Dark Bronze Architectural Transition Trim */}
        <mesh position={[0, 0.001, 3.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.84, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -3.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.84, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-2.9, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 6.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[2.9, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 6.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          2. NORTH ARCHITECTURAL REAR WALL & PANORAMIC WINDOW BAYS (z = -5.8)
          ══════════════════════════════════════════════════════════════════ */}
      {/* Central Command Wall Backing (Where War-Room display is mounted, x: -8 to 8) */}
      <group position={[0, 2.1, -5.8]}>
        {/* Warm Architectural Charcoal Limestone Pier */}
        <mesh receiveShadow>
          <boxGeometry args={[16, 4.2, 0.35]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.8} metalness={0.1} />
        </mesh>

        {/* Acoustic Vertical Fluted American Walnut Louvers along central corridor backing */}
        <group position={[0, 0, 0.18]}>
          {[...Array(32)].map((_, i) => (
            <mesh key={`north-slat-${i}`} position={[-7.2 + i * 0.465, 0, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[0.08, 4.16, 0.035]} />
              <meshStandardMaterial color="#543724" roughness={0.42} metalness={0.06} />
            </mesh>
          ))}
        </group>
      </group>

      {/* North-East Panoramic Glass Bay (x: 8 to 24, z: -5.8) looking out at North Skyline */}
      <group position={[16, 2.1, -5.8]}>
        <mesh>
          <boxGeometry args={[16, 4.16, 0.03]} />
          <meshPhysicalMaterial
            color="#e2effa"
            transparent
            opacity={0.16}
            roughness={0.03}
            transmission={0.96}
            ior={1.52}
            reflectivity={0.7}
          />
        </mesh>
        {/* Champagne Bronze Mullions */}
        {[-7, -3.5, 0, 3.5, 7].map((x, i) => (
          <mesh key={`ne-mullion-${i}`} position={[x, 0, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.08, 4.16, 0.14]} />
            <meshStandardMaterial color="#4a3e32" roughness={0.35} metalness={0.88} />
          </mesh>
        ))}
      </group>

      {/* North-West Panoramic Glass Bay (x: -8 to -24, z: -5.8) looking out at North Skyline */}
      <group position={[-16, 2.1, -5.8]}>
        <mesh>
          <boxGeometry args={[16, 4.16, 0.03]} />
          <meshPhysicalMaterial
            color="#e2effa"
            transparent
            opacity={0.16}
            roughness={0.03}
            transmission={0.96}
            ior={1.52}
            reflectivity={0.7}
          />
        </mesh>
        {/* Champagne Bronze Mullions */}
        {[-7, -3.5, 0, 3.5, 7].map((x, i) => (
          <mesh key={`nw-mullion-${i}`} position={[x, 0, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.08, 4.16, 0.14]} />
            <meshStandardMaterial color="#4a3e32" roughness={0.35} metalness={0.88} />
          </mesh>
        ))}
      </group>

      {/* Recessed Linear Warm LED Cove at Top of Rear Wall */}
      <mesh position={[0, 4.16, -5.5]}>
        <boxGeometry args={[53.8, 0.05, 0.08]} />
        <meshStandardMaterial color="#fff5e6" emissive="#fff3df" emissiveIntensity={2.0} toneMapped={false} />
      </mesh>

      {/* ══════════════════════════════════════════════════════════════════
          3. EAST EXTERIOR GLASS CURTAIN WALL & BALCONY OPENING
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[8.5, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Full-Height Architectural Glass Panels (24m span) */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[24, 4.16, 0.03]} />
          <meshPhysicalMaterial 
            color="#e2effa" 
            transparent 
            opacity={0.16} 
            roughness={0.03} 
            transmission={0.96} 
            ior={1.52} 
            reflectivity={0.7} 
          />
        </mesh>

        {/* Champagne Bronze Architectural Mullions & Structural Ribs */}
        {[-10, -6, -2, 2, 6, 10].map((x, i) => (
          <mesh key={`mullion-${i}`} position={[x, 0, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.09, 4.16, 0.16]} />
            <meshStandardMaterial color="#4a3e32" roughness={0.35} metalness={0.88} />
          </mesh>
        ))}

        {/* Intermediate Horizontal Transom Bars */}
        <mesh position={[0, 1.2, 0.03]}>
          <boxGeometry args={[24, 0.06, 0.08]} />
          <meshStandardMaterial color="#4a3e32" roughness={0.35} metalness={0.88} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          4. ARCHITECTURAL CEILING AT 4.2M COMMERCIAL HEIGHT (WARM OFF-WHITE)
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 4.2, 5]}>
        {/* Crisp Commercial Acoustic Ceiling Plaster */}
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[56, 44]} />
          <meshStandardMaterial color="#e5e0d8" roughness={0.9} />
        </mesh>

        {/* Recessed Linear Warm 3200K LED Troffers */}
        {[-14, -6, 0, 6, 14].map((x, i) => (
          <group key={`ceiling-light-${i}`} position={[x, -0.015, 0]}>
            <mesh>
              <boxGeometry args={[0.16, 0.03, 34]} />
              <meshStandardMaterial color="#443b32" roughness={0.6} metalness={0.7} />
            </mesh>
            <mesh position={[0, -0.008, 0]}>
              <boxGeometry args={[0.08, 0.01, 33.6]} />
              <meshStandardMaterial color="#fff6ea" emissive="#fff3df" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          5. SECONDARY MINIMALIST OFFICE FURNITURE & CREDENZA
          ══════════════════════════════════════════════════════════════════ */}
      {/* Low Walnut Credenza along Rear Wall */}
      <group position={[-4.5, 0, -5.2]}>
        <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.58, 0.45]} />
          <meshStandardMaterial color="#2c1c12" roughness={0.42} metalness={0.06} />
        </mesh>
        {/* Metal legs */}
        <mesh position={[-1.05, 0.045, 0]} castShadow>
          <boxGeometry args={[0.04, 0.09, 0.38]} />
          <meshStandardMaterial color="#14151a" roughness={0.5} metalness={0.85} />
        </mesh>
        <mesh position={[1.05, 0.045, 0]} castShadow>
          <boxGeometry args={[0.04, 0.09, 0.38]} />
          <meshStandardMaterial color="#14151a" roughness={0.5} metalness={0.85} />
        </mesh>

        {/* Minimal Ceramic Sculpture on Credenza */}
        <group position={[0.7, 0.74, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.06, 0.16, 20]} />
            <meshStandardMaterial color="#e2ded6" roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Architectural Concrete Planter with Stem-Connected Botanical Foliage */}
      <group position={[7.2, 0, -4.6]}>
        <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.22, 0.7, 24]} />
          <meshStandardMaterial color="#282a32" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.68, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.05, 24]} />
          <meshStandardMaterial color="#14100c" roughness={0.9} />
        </mesh>
        {/* Central Woody Plant Stalk */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.03, 0.7, 12]} />
          <meshStandardMaterial color="#2a2018" roughness={0.9} />
        </mesh>
        {/* Branch-connected architectural foliage */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const branchY = 0.85 + i * 0.08;
          return (
            <group key={`leaf-branch-${i}`} position={[0, branchY, 0]} rotation={[0.25, rad, 0.2]}>
              {/* Branch stem */}
              <mesh position={[0.08, 0, 0]} rotation={[0, 0, -0.3]} castShadow>
                <cylinderGeometry args={[0.005, 0.008, 0.16, 8]} />
                <meshStandardMaterial color="#2a2018" roughness={0.9} />
              </mesh>
              {/* Leaf blade */}
              <mesh position={[0.20, 0.04, 0]} rotation={[0, 0, -0.3]} castShadow>
                <boxGeometry args={[0.18, 0.005, 0.12]} />
                <meshStandardMaterial color="#1c2e22" roughness={0.6} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
