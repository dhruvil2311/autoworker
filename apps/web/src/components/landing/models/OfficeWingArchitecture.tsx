import React from 'react';
import * as THREE from 'three';

export function OfficeWingArchitecture() {
  return (
    <group>
      {/* ══════════════════════════════════════════════════════════════════
          1. INSET ACOUSTIC WOOL CARPET TILES (Zone Grounding)
          ══════════════════════════════════════════════════════════════════ */}
      {/* Operations Carpet (West Wing: x: -8.8, z: -0.8) */}
      <group position={[-8.8, 0.002, -0.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[7.2, 5.8]} />
          <meshStandardMaterial color="#242c3d" roughness={0.92} metalness={0.02} />
        </mesh>
        {/* Champagne Bronze Architectural Transition Trim */}
        <mesh position={[0, 0.001, 2.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.24, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -2.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.24, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-3.6, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.8]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[3.6, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.8]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* Finance Carpet (East Wing: x: +8.8, z: -0.8) */}
      <group position={[8.8, 0.002, -0.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[7.2, 5.8]} />
          <meshStandardMaterial color="#233227" roughness={0.92} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.001, 2.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.24, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -2.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.24, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-3.6, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.8]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[3.6, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.8]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* Inventory Carpet (South-West: x: -8.0, z: 3.8) */}
      <group position={[-8.0, 0.002, 3.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[6.4, 5.2]} />
          <meshStandardMaterial color="#32271e" roughness={0.92} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.001, 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.44, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.44, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-3.2, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[3.2, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* Customer Ops Carpet (South-East: x: +8.0, z: 3.8) */}
      <group position={[8.0, 0.002, 3.8]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[6.4, 5.2]} />
          <meshStandardMaterial color="#2d2334" roughness={0.92} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.001, 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.44, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.44, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-3.2, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[3.2, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 5.2]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* Executive Orchestration Hub Carpet (North Central: x: 0, z: -3.2) */}
      <group position={[0, 0.002, -3.2]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[5.6, 4.4]} />
          <meshStandardMaterial color="#232734" roughness={0.92} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.001, 2.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.64, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.001, -2.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.64, 0.025]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-2.8, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 4.4]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[2.8, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 4.4]} />
          <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          2. STRUCTURAL ARCHITECTURAL COLUMNS (Corridor Rhythm at x = +/-6.4m)
          ══════════════════════════════════════════════════════════════════ */}
      {/* Four architectural fluted columns framing wing portals without blocking central video wall */}
      {([
        [-6.4, 2.1, -1.8],
        [6.4, 2.1, -1.8],
        [-6.4, 2.1, 3.8],
        [6.4, 2.1, 3.8],
      ] as const).map(([cx, cy, cz], idx) => (
        <group key={`column-${idx}`} position={[cx, cy, cz]}>
          {/* Honed French Limestone Column Shaft */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.36, 4.2, 0.36]} />
            <meshStandardMaterial color="#d4cdc1" roughness={0.65} metalness={0.06} />
          </mesh>
          {/* Vertical Fluted Bronze Inlays on Facets */}
          <mesh position={[0, 0, 0.185]}>
            <boxGeometry args={[0.04, 4.0, 0.015]} />
            <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0, -0.185]}>
            <boxGeometry args={[0.04, 4.0, 0.015]} />
            <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
          </mesh>
          {/* Champagne Bronze Base Plinth */}
          <mesh position={[0, -2.0, 0]}>
            <boxGeometry args={[0.42, 0.14, 0.42]} />
            <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
          </mesh>
          {/* Champagne Bronze Capital Trim */}
          <mesh position={[0, 2.0, 0]}>
            <boxGeometry args={[0.42, 0.14, 0.42]} />
            <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
          </mesh>
        </group>
      ))}

      {/* ══════════════════════════════════════════════════════════════════
          3. PERIMETER DAYLIGHT WINDOW WALLS (West & East Facades)
          ══════════════════════════════════════════════════════════════════ */}
      {/* West Daylight Window Wall (x = -13.8) */}
      <group position={[-13.8, 2.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[15.6, 4.16, 0.03]} />
          <meshPhysicalMaterial
            color="#e8f2f8"
            transparent
            opacity={0.22}
            roughness={0.04}
            transmission={0.94}
            ior={1.52}
            reflectivity={0.65}
          />
        </mesh>
        {[-5.2, 0, 5.2].map((x, i) => (
          <mesh key={`w-mullion-${i}`} position={[x, 0, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.08, 4.16, 0.12]} />
            <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
          </mesh>
        ))}
      </group>

      {/* East Daylight Window Wall (x = +13.8) */}
      <group position={[13.8, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[15.6, 4.16, 0.03]} />
          <meshPhysicalMaterial
            color="#e8f2f8"
            transparent
            opacity={0.22}
            roughness={0.04}
            transmission={0.94}
            ior={1.52}
            reflectivity={0.65}
          />
        </mesh>
        {[-5.2, 0, 5.2].map((x, i) => (
          <mesh key={`e-mullion-${i}`} position={[x, 0, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[0.08, 4.16, 0.12]} />
            <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
