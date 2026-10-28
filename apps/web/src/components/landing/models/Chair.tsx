import React from 'react';

export function Chair() {
  return (
    <group rotation={[0, Math.PI, 0]}>
      {/* ── 5-Star Brushed Aluminum Base Hub ── */}
      <mesh position={[0, 0.28, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.24, 0.32, 0.16, 16]} />
        <meshStandardMaterial color="#111116" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 5 Spoke Legs with Smooth Wheels */}
      {[...Array(5)].map((_, i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <mesh position={[0, 0.18, 0.95]} rotation={[0.08, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.12, 0.08, 1.8]} />
            <meshStandardMaterial color="#161620" roughness={0.35} metalness={0.8} />
          </mesh>
          {/* Caster Wheel Housing & Wheel */}
          <group position={[0, 0.08, 1.75]}>
            <mesh rotation={[0, 0, Math.PI / 2]} receiveShadow castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.06, 14]} />
              <meshStandardMaterial color="#08080b" roughness={0.8} />
            </mesh>
          </group>
        </group>
      ))}

      {/* ── Pneumatic Gas Lift Column ── */}
      <mesh position={[0, 0.85, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.06, 0.07, 1.1, 16]} />
        <meshStandardMaterial color="#282832" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* ── Under-Seat Mechanism Box ── */}
      <mesh position={[0, 1.45, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.7, 0.16, 0.7]} />
        <meshStandardMaterial color="#0b0b0f" roughness={0.7} metalness={0.6} />
      </mesh>

      {/* ── Ergonomic Seat Cushion (Dark Charcoal Weave) ── */}
      <mesh position={[0, 1.6, 0.08]} receiveShadow castShadow>
        <boxGeometry args={[1.7, 0.18, 1.65]} />
        <meshStandardMaterial color="#181820" roughness={0.9} />
      </mesh>

      {/* ── Ergonomic Mesh Backrest ── */}
      <group position={[0, 2.7, 0.75]}>
        {/* Spine Support Rib */}
        <mesh position={[0, -0.4, 0.1]} rotation={[0.08, 0, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.16, 1.3, 0.08]} />
          <meshStandardMaterial color="#101015" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Breathable Mesh Frame */}
        <mesh position={[0, 0.2, 0]} rotation={[-0.08, 0, 0]} receiveShadow castShadow>
          <boxGeometry args={[1.5, 1.7, 0.1]} />
          <meshStandardMaterial color="#14141a" roughness={0.92} />
        </mesh>
        {/* Lumbar Support Pad */}
        <mesh position={[0, -0.2, -0.04]} rotation={[-0.08, 0, 0]} receiveShadow castShadow>
          <boxGeometry args={[1.2, 0.35, 0.06]} />
          <meshStandardMaterial color="#0b0b0e" roughness={0.8} />
        </mesh>
      </group>

      {/* ── 3D Adjustable Armrests ── */}
      {[-0.95, 0.95].map((xSide, i) => (
        <group key={`arm-${i}`} position={[xSide, 1.45, 0]}>
          <mesh position={[0, 0.45, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.08, 0.85, 0.14]} />
            <meshStandardMaterial color="#121218" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.9, 0.18]} receiveShadow castShadow>
            <boxGeometry args={[0.18, 0.06, 0.95]} />
            <meshStandardMaterial color="#09090d" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
