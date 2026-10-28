import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Realistic Metropolitan Skyscraper Cityscape
 * Generates an authentic high-density cityscape outside the executive office windows:
 * - Twilight atmospheric sky dome with realistic horizon gradient and urban haze
 * - Architectural skyscraper towers with physical glass curtain walls, spandrels, and floor bands
 * - Real floor-by-floor illuminated office windows (warm incandescent & cool daylight)
 * - Stepped setback crowns with architectural floodlighting & spires
 * - Authentic NYC cedar water tanks, commercial HVAC cooling units, and aviation beacons
 * - Outdoor teak observation terrace with frameless glass balustrade
 */

interface BuildingDef {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tiers: number;
  glassColor: string;
  hasCrown?: boolean;
  hasSpire?: boolean;
  hasWaterTank?: boolean;
  hasHvac?: boolean;
  litRatio: number;
}

/**
 * Creates an authentic architectural floor-by-floor window texture
 * with realistic horizontal spandrels, vertical mullions, and warm/cool office lighting.
 */
function createArchitecturalWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Dark architectural spandrel base (midnight charcoal glass)
  ctx.fillStyle = '#0e131d';
  ctx.fillRect(0, 0, 1024, 1024);

  const floors = 32;
  const baysPerFloor = 16;
  const floorH = 1024 / floors;
  const bayW = 1024 / baysPerFloor;

  const spandrelH = floorH * 0.32; // Solid architectural slab between floors
  const windowH = floorH - spandrelH;
  const mullionW = 3; // Vertical metal window frame

  const windowColors = [
    { bg: '#fff2d6', glow: 0.85 }, // Warm Incandescent Executive Office
    { bg: '#e8f0fe', glow: 0.90 }, // Cool Daylight LED Trading Floor
    { bg: '#ffe8b5', glow: 0.75 }, // Soft Amber Desk Lamp
    { bg: '#93c5fd', glow: 0.80 }, // Architectural Blue Accent
    { bg: '#141a26', glow: 0.05 }, // Dark / Unoccupied Office
  ];

  for (let f = 0; f < floors; f++) {
    const y = f * floorH;

    // Floor Spandrel Band (Solid metal/stone slab between floors)
    ctx.fillStyle = '#111622';
    ctx.fillRect(0, y, 1024, spandrelH);

    // Subtle horizontal aluminum trim reveal
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, y + spandrelH - 1.5, 1024, 1.5);

    // Window Vision Glass Ribbon
    const windowY = y + spandrelH;

    // Some floors are mostly lit, some are mostly dark (realistic office tenancy)
    const floorTenancy = Math.random();

    for (let b = 0; b < baysPerFloor; b++) {
      const windowX = b * bayW + mullionW;
      const curW = bayW - mullionW * 2;

      let colorObj = windowColors[4]!; // default dark
      if (floorTenancy > 0.35) {
        if (Math.random() > 0.4) {
          colorObj = windowColors[Math.floor(Math.random() * (windowColors.length - 1))]!;
        }
      }

      ctx.fillStyle = colorObj.bg;
      ctx.fillRect(windowX, windowY, curW, windowH);

      // Subtle internal blind/shade variation
      if (colorObj.glow > 0.5 && Math.random() > 0.6) {
        ctx.fillStyle = 'rgba(15, 20, 30, 0.35)';
        const blindH = Math.random() * (windowH * 0.6);
        ctx.fillRect(windowX, windowY, curW, blindH);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 8;
  return texture;
}

function createAtmosphericSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#0c1424'); // Deep twilight sapphire zenith
  grad.addColorStop(0.28, '#13213a'); // High dusk navy
  grad.addColorStop(0.44, '#1e3250'); // Rich twilight sky transition
  grad.addColorStop(0.50, '#2d486d'); // Atmospheric luminous horizon sky
  grad.addColorStop(0.54, '#38587e'); // Luminous city light pollution rim
  grad.addColorStop(0.62, '#202c3e'); // Lower urban atmosphere
  grad.addColorStop(1.0, '#0a0d14'); // Ground basin nadir

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function CitySkyline() {
  const windowTexture = useMemo(() => createArchitecturalWindowTexture(), []);
  const skyTexture = useMemo(() => createAtmosphericSkyTexture(), []);
  const beaconRef = useRef<THREE.PointLight[]>([]);

  // ── Realistic Metropolitan Tower Placements ──
  // Placed at natural urban distances outside East, North, and West window walls
  const buildings: BuildingDef[] = useMemo(
    () => [
      // ── Primary East Vistas (visible through the 24m glass curtain wall) ──
      { x: 19, z: -2, w: 9.5, d: 9.5, h: 78, tiers: 3, glassColor: '#1a2233', hasCrown: true, hasSpire: true, litRatio: 0.85 },
      { x: 23, z: 9, w: 11, d: 8.5, h: 86, tiers: 3, glassColor: '#161e2e', hasHvac: true, hasWaterTank: true, litRatio: 0.8 },
      { x: 17, z: -15, w: 8.5, d: 9, h: 42, tiers: 2, glassColor: '#182030', hasWaterTank: true, litRatio: 0.75 }, // Lower mid-rise (look down on roof)
      { x: 22, z: -26, w: 12, d: 11, h: 95, tiers: 4, glassColor: '#1c2538', hasCrown: true, hasSpire: true, litRatio: 0.9 },
      { x: 20, z: 21, w: 9, d: 8, h: 44, tiers: 2, glassColor: '#151c2a', hasHvac: true, litRatio: 0.7 }, // Lower building

      // ── Midground East Towers (Expanding City Depth) ──
      { x: 33, z: 2, w: 14, d: 12, h: 110, tiers: 4, glassColor: '#151d2c', hasCrown: true, hasSpire: true, hasHvac: true, litRatio: 0.9 },
      { x: 29, z: -12, w: 10, d: 10, h: 82, tiers: 3, glassColor: '#182030', hasWaterTank: true, litRatio: 0.8 },
      { x: 35, z: -22, w: 13, d: 13, h: 94, tiers: 3, glassColor: '#161f2e', hasCrown: true, litRatio: 0.85 },
      { x: 31, z: 15, w: 11, d: 11, h: 88, tiers: 3, glassColor: '#141b28', hasHvac: true, litRatio: 0.75 },
      { x: 38, z: 28, w: 13, d: 11, h: 105, tiers: 4, glassColor: '#1a2336', hasSpire: true, litRatio: 0.85 },

      // ── North & North-East Vistas (visible through rear panoramic bays) ──
      { x: 6, z: -22, w: 9, d: 8, h: 72, tiers: 2, glassColor: '#161e2e', hasHvac: true, litRatio: 0.75 },
      { x: -7, z: -24, w: 11, d: 9, h: 86, tiers: 3, glassColor: '#182234', hasCrown: true, hasWaterTank: true, litRatio: 0.85 },
      { x: -17, z: -25, w: 10, d: 9.5, h: 76, tiers: 2, glassColor: '#151d2a', hasHvac: true, litRatio: 0.7 },
      { x: 13, z: -33, w: 13, d: 12, h: 106, tiers: 4, glassColor: '#172030', hasCrown: true, hasSpire: true, litRatio: 0.9 },
      { x: -2, z: -37, w: 15, d: 14, h: 120, tiers: 4, glassColor: '#1b2436', hasCrown: true, hasSpire: true, litRatio: 0.95 },
      { x: -15, z: -39, w: 12, d: 11, h: 96, tiers: 3, glassColor: '#151c2b', hasWaterTank: true, litRatio: 0.8 },

      // ── West Vistas (visible through the West daylight window wall) ──
      { x: -22, z: 2, w: 10, d: 9, h: 78, tiers: 3, glassColor: '#1a2233', hasCrown: true, hasSpire: true, litRatio: 0.85 },
      { x: -26, z: 12, w: 12, d: 10, h: 88, tiers: 3, glassColor: '#161e2e', hasHvac: true, hasWaterTank: true, litRatio: 0.8 },
      { x: -20, z: -12, w: 9, d: 8.5, h: 42, tiers: 2, glassColor: '#182030', hasWaterTank: true, litRatio: 0.75 }, // Lower building
      { x: -28, z: -22, w: 13, d: 11, h: 100, tiers: 4, glassColor: '#1c2538', hasCrown: true, hasSpire: true, litRatio: 0.9 },
      { x: -32, z: 22, w: 14, d: 12, h: 104, tiers: 4, glassColor: '#151d2c', hasSpire: true, litRatio: 0.8 },

      // ── Deep Horizon Silhouettes ──
      { x: 52, z: -8, w: 18, d: 16, h: 125, tiers: 3, glassColor: '#101622', hasCrown: true, hasSpire: true, litRatio: 0.75 },
      { x: 55, z: 14, w: 16, d: 15, h: 118, tiers: 3, glassColor: '#121824', hasSpire: true, litRatio: 0.7 },
      { x: 49, z: -34, w: 19, d: 17, h: 138, tiers: 4, glassColor: '#0f1420', hasCrown: true, hasSpire: true, litRatio: 0.8 },
      { x: -38, z: -40, w: 16, d: 14, h: 112, tiers: 3, glassColor: '#111724', hasSpire: true, litRatio: 0.75 },
      { x: 25, z: -46, w: 18, d: 16, h: 130, tiers: 4, glassColor: '#101622', hasCrown: true, litRatio: 0.85 },
    ],
    []
  );

  // Blinking red aviation hazard beacons
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const flash = Math.sin(t * 3.2) > 0.6 ? 1.6 : 0.1;
    beaconRef.current.forEach((light) => {
      if (light) light.intensity = flash;
    });
  });

  return (
    <group>
      {/* ══════════════════════════════════════════════════════════════════
          1. REALISTIC METROPOLITAN 360° TWILIGHT SKY DOME & HORIZON GLOW
          ══════════════════════════════════════════════════════════════════ */}
      {/* 360-degree Twilight Sky Sphere (Envelops all vistas seamlessly) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[190, 48, 32]} />
        <meshBasicMaterial
          map={skyTexture}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Atmospheric Horizon Light Scatter Cylinder */}
      <mesh position={[0, 10, 0]}>
        <cylinderGeometry args={[185, 185, 50, 48, 1, true]} />
        <meshBasicMaterial
          color="#2a3b54"
          transparent
          opacity={0.35}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Street-Level Urban Basin Ground Plane at Level 42 Depth (-45m) ── */}
      <mesh position={[0, -45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[450, 450]} />
        <meshStandardMaterial
          color="#080a10"
          roughness={0.85}
          metalness={0.15}
        />
      </mesh>

      {/* Street-Level Urban Traffic Grid (Luminous Arterial Avenues Far Below) */}
      <group position={[0, -44.8, 0]}>
        {/* East-West Avenues */}
        {[-80, -40, 0, 40, 80].map((z, idx) => (
          <group key={`avenue-ew-${idx}`}>
            {/* Avenue Roadway */}
            <mesh position={[0, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[420, 4.5]} />
              <meshBasicMaterial color="#1a1c24" />
            </mesh>
            {/* Golden Sodium Streetlight & Headlight Stream */}
            <mesh position={[0, 0.05, z + 1]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[420, 0.4]} />
              <meshBasicMaterial color="#fbbf24" />
            </mesh>
            {/* Crimson Taillight Stream */}
            <mesh position={[0, 0.05, z - 1]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[420, 0.35]} />
              <meshBasicMaterial color="#ef4444" />
            </mesh>
          </group>
        ))}

        {/* North-South Streets */}
        {[-80, -40, 0, 40, 80].map((x, idx) => (
          <group key={`avenue-ns-${idx}`}>
            {/* Street Roadway */}
            <mesh position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[4.0, 420]} />
              <meshBasicMaterial color="#181a20" />
            </mesh>
            {/* Sodium Streetlight Stream */}
            <mesh position={[x + 0.9, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.35, 420]} />
              <meshBasicMaterial color="#f59e0b" />
            </mesh>
            {/* White Headlight Stream */}
            <mesh position={[x - 0.9, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.35, 420]} />
              <meshBasicMaterial color="#e2e8f0" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Exterior City Twilight Lighting */}
      <directionalLight position={[35, 45, -25]} intensity={0.85} color="#94a3b8" />

      {/* ══════════════════════════════════════════════════════════════════
          2. OUTDOOR OBSERVATION TERRACE & BALCONY (East / North-East)
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[11.5, 0, 0]}>
        {/* Architectural Teak Composite Deck Surface */}
        <mesh position={[0, -0.04, 0]} receiveShadow>
          <boxGeometry args={[6.0, 0.08, 28]} />
          <meshStandardMaterial color="#261b12" roughness={0.75} metalness={0.05} />
        </mesh>

        {/* Outer Frameless Architectural Glass Balustrade (1.15m height) */}
        <mesh position={[2.95, 0.58, 0]}>
          <boxGeometry args={[0.04, 1.15, 28]} />
          <meshPhysicalMaterial
            color="#dbeafe"
            transparent
            opacity={0.25}
            roughness={0.04}
            transmission={0.92}
            ior={1.5}
            reflectivity={0.65}
          />
        </mesh>

        {/* Brushed Stainless Steel Cap Handrail */}
        <mesh position={[2.95, 1.16, 0]}>
          <boxGeometry args={[0.08, 0.04, 28]} />
          <meshStandardMaterial color="#8b92a0" roughness={0.3} metalness={0.9} />
        </mesh>

        {/* North and South Return Balustrades */}
        <mesh position={[0, 0.58, -14]}>
          <boxGeometry args={[5.9, 1.15, 0.04]} />
          <meshPhysicalMaterial
            color="#dbeafe"
            transparent
            opacity={0.25}
            roughness={0.04}
            transmission={0.92}
            ior={1.5}
          />
        </mesh>
        <mesh position={[0, 1.16, -14]}>
          <boxGeometry args={[5.9, 0.04, 0.08]} />
          <meshStandardMaterial color="#8b92a0" roughness={0.3} metalness={0.9} />
        </mesh>

        <mesh position={[0, 0.58, 14]}>
          <boxGeometry args={[5.9, 1.15, 0.04]} />
          <meshPhysicalMaterial
            color="#dbeafe"
            transparent
            opacity={0.25}
            roughness={0.04}
            transmission={0.92}
            ior={1.5}
          />
        </mesh>
        <mesh position={[0, 1.16, 14]}>
          <boxGeometry args={[5.9, 0.04, 0.08]} />
          <meshStandardMaterial color="#8b92a0" roughness={0.3} metalness={0.9} />
        </mesh>

        {/* Soft Recessed Deck Step Lights */}
        {[-10, -5, 0, 5, 10].map((z, i) => (
          <mesh key={`deck-light-${i}`} position={[2.88, 0.06, z]}>
            <boxGeometry args={[0.02, 0.04, 0.4]} />
            <meshStandardMaterial
              color="#fff4e0"
              emissive="#fff0d0"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          3. REALISTIC ARCHITECTURAL SKYSCRAPER TOWERS
          ══════════════════════════════════════════════════════════════════ */}
      {buildings.map((b, idx) => {
        const tierHeight = b.h / b.tiers;

        return (
          <group key={`tower-${idx}`} position={[b.x, -45, b.z]}>
            {/* Multi-Tier Stepped Building Silhouette */}
            {[...Array(b.tiers)].map((_, tIdx) => {
              const scale = 1 - tIdx * 0.15;
              const curW = b.w * scale;
              const curD = b.d * scale;
              const curY = tIdx * tierHeight + tierHeight / 2;

              return (
                <group key={`tier-${tIdx}`} position={[0, curY, 0]}>
                  {/* Structural Building Mass (Dark Anodized Glass Curtain Wall) */}
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[curW, tierHeight, curD]} />
                    <meshStandardMaterial
                      color={b.glassColor}
                      roughness={0.25}
                      metalness={0.7}
                    />
                  </mesh>

                  {/* Floor-by-Floor Illuminated Vision Glass Panels (Front Face) */}
                  <mesh position={[0, 0, curD / 2 + 0.02]}>
                    <planeGeometry args={[curW * 0.96, tierHeight * 0.96]} />
                    <meshStandardMaterial
                      map={windowTexture}
                      roughness={0.15}
                      metalness={0.2}
                      emissive="#ffffff"
                      emissiveMap={windowTexture}
                      emissiveIntensity={0.85 * b.litRatio}
                      toneMapped={false}
                    />
                  </mesh>

                  {/* Rear Face */}
                  <mesh position={[0, 0, -curD / 2 - 0.02]} rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[curW * 0.96, tierHeight * 0.96]} />
                    <meshStandardMaterial
                      map={windowTexture}
                      roughness={0.15}
                      metalness={0.2}
                      emissive="#ffffff"
                      emissiveMap={windowTexture}
                      emissiveIntensity={0.85 * b.litRatio}
                      toneMapped={false}
                    />
                  </mesh>

                  {/* Right Face */}
                  <mesh position={[curW / 2 + 0.02, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                    <planeGeometry args={[curD * 0.96, tierHeight * 0.96]} />
                    <meshStandardMaterial
                      map={windowTexture}
                      roughness={0.15}
                      metalness={0.2}
                      emissive="#ffffff"
                      emissiveMap={windowTexture}
                      emissiveIntensity={0.85 * b.litRatio}
                      toneMapped={false}
                    />
                  </mesh>

                  {/* Left Face */}
                  <mesh position={[-curW / 2 - 0.02, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                    <planeGeometry args={[curD * 0.96, tierHeight * 0.96]} />
                    <meshStandardMaterial
                      map={windowTexture}
                      roughness={0.15}
                      metalness={0.2}
                      emissive="#ffffff"
                      emissiveMap={windowTexture}
                      emissiveIntensity={0.85 * b.litRatio}
                      toneMapped={false}
                    />
                  </mesh>

                  {/* Architectural Parapet Reveal Line */}
                  <mesh position={[0, tierHeight / 2 - 0.06, 0]}>
                    <boxGeometry args={[curW + 0.12, 0.12, curD + 0.12]} />
                    <meshStandardMaterial color="#242c3d" roughness={0.35} metalness={0.8} />
                  </mesh>
                </group>
              );
            })}

            {/* ── Rooftop Architectural Crown & Features ── */}
            <group position={[0, b.h, 0]}>
              {/* Mechanical Penthouse */}
              <mesh position={[0, 1.4, 0]} castShadow>
                <boxGeometry args={[b.w * 0.42, 2.8, b.d * 0.42]} />
                <meshStandardMaterial color="#1a202c" roughness={0.5} metalness={0.6} />
              </mesh>

              {/* Illuminated Architectural Crown (Art Deco Setback Floodlit Crown) */}
              {b.hasCrown && (
                <group position={[0, 2.8, 0]}>
                  {/* Stepped Crown Tier 1 */}
                  <mesh position={[0, 0.8, 0]}>
                    <boxGeometry args={[b.w * 0.28, 1.6, b.d * 0.28]} />
                    <meshStandardMaterial
                      color="#243048"
                      emissive="#60a5fa"
                      emissiveIntensity={0.35}
                      roughness={0.2}
                      metalness={0.8}
                    />
                  </mesh>
                  {/* Stepped Crown Tier 2 */}
                  <mesh position={[0, 2.0, 0]}>
                    <boxGeometry args={[b.w * 0.18, 1.2, b.d * 0.18]} />
                    <meshStandardMaterial
                      color="#2a3854"
                      emissive="#93c5fd"
                      emissiveIntensity={0.45}
                      roughness={0.2}
                      metalness={0.85}
                    />
                  </mesh>
                </group>
              )}

              {/* NYC Cedar Rooftop Water Tank on Timber Frame */}
              {b.hasWaterTank && (
                <group position={[b.w * 0.22, 1.8, b.d * 0.2]}>
                  {/* Timber Trestle Staging */}
                  <mesh position={[0, 0.4, 0]}>
                    <boxGeometry args={[1.5, 0.8, 1.5]} />
                    <meshStandardMaterial color="#2d2218" roughness={0.9} />
                  </mesh>
                  {/* Cedar Wood Barrel */}
                  <mesh position={[0, 1.6, 0]} castShadow>
                    <cylinderGeometry args={[0.7, 0.7, 1.6, 16]} />
                    <meshStandardMaterial color="#4a3726" roughness={0.85} />
                  </mesh>
                  {/* Conical Wooden Cap */}
                  <mesh position={[0, 2.7, 0]}>
                    <coneGeometry args={[0.78, 0.65, 16]} />
                    <meshStandardMaterial color="#362518" roughness={0.9} />
                  </mesh>
                </group>
              )}

              {/* Commercial Rooftop HVAC Chillers */}
              {b.hasHvac && (
                <group position={[-b.w * 0.2, 0.8, -b.d * 0.2]}>
                  <mesh castShadow>
                    <boxGeometry args={[2.4, 1.4, 1.8]} />
                    <meshStandardMaterial color="#454c5e" roughness={0.4} metalness={0.6} />
                  </mesh>
                  <mesh position={[0, 0.75, 0]}>
                    <cylinderGeometry args={[0.55, 0.55, 0.2, 16]} />
                    <meshStandardMaterial color="#2b3140" roughness={0.3} metalness={0.8} />
                  </mesh>
                </group>
              )}

              {/* Architectural Spire with Blinking Aviation Warning Beacon */}
              {b.hasSpire && (
                <group position={[0, b.hasCrown ? 4.8 : 2.8, 0]}>
                  {/* Stainless Steel Mast */}
                  <mesh position={[0, 2.5, 0]}>
                    <cylinderGeometry args={[0.06, 0.35, 5.0, 8]} />
                    <meshStandardMaterial color="#c0c5d6" roughness={0.2} metalness={0.95} />
                  </mesh>
                  {/* Antenna Needle Tip */}
                  <mesh position={[0, 5.8, 0]}>
                    <cylinderGeometry args={[0.02, 0.06, 2.0, 8]} />
                    <meshStandardMaterial color="#e0e4f2" roughness={0.15} metalness={0.98} />
                  </mesh>

                  {/* Pulsing Red Hazard Beacon Light */}
                  <mesh position={[0, 7.0, 0]}>
                    <sphereGeometry args={[0.15, 12, 12]} />
                    <meshBasicMaterial color="#ff2222" />
                  </mesh>
                  <pointLight
                    ref={(el) => {
                      if (el && !beaconRef.current.includes(el)) {
                        beaconRef.current.push(el);
                      }
                    }}
                    position={[0, 7.0, 0]}
                    color="#ff1111"
                    intensity={1.2}
                    distance={24}
                  />
                </group>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
