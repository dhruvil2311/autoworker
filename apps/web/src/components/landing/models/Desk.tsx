import React from 'react';

interface DeskProps {
  isExecutive?: boolean | undefined;
}

export function Desk({ isExecutive = false }: DeskProps) {
  // Dark walnut warm solid wood tone
  const woodColor = isExecutive ? '#2b1d15' : '#221711';
  const legColor = '#131317';

  return (
    <group>
      {/* ── Main Solid Walnut Desktop Surface ── */}
      <mesh position={[0, 2.9, 0]} receiveShadow castShadow>
        <boxGeometry args={[isExecutive ? 7.8 : 6.8, 0.14, isExecutive ? 3.6 : 3.2]} />
        <meshStandardMaterial 
          color={woodColor} 
          roughness={0.4} 
          metalness={0.1} 
        />
      </mesh>

      {/* Desktop Under-Bevel */}
      <mesh position={[0, 2.81, 0]} receiveShadow>
        <boxGeometry args={[isExecutive ? 7.82 : 6.82, 0.04, isExecutive ? 3.62 : 3.22]} />
        <meshStandardMaterial color="#18100a" roughness={0.6} />
      </mesh>

      {/* ── Blackened Steel Chamfered Leg Frames ── */}
      <group position={[0, 1.4, 0]}>
        {/* Left Leg Assembly */}
        <mesh position={[-3.1, 0, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.16, 2.8, 2.8]} />
          <meshStandardMaterial color={legColor} roughness={0.6} metalness={0.8} />
        </mesh>
        <mesh position={[-3.1, -1.35, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.28, 0.08, 3.0]} />
          <meshStandardMaterial color={legColor} roughness={0.6} metalness={0.8} />
        </mesh>

        {/* Right Leg Assembly */}
        <mesh position={[3.1, 0, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.16, 2.8, 2.8]} />
          <meshStandardMaterial color={legColor} roughness={0.6} metalness={0.8} />
        </mesh>
        <mesh position={[3.1, -1.35, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.28, 0.08, 3.0]} />
          <meshStandardMaterial color={legColor} roughness={0.6} metalness={0.8} />
        </mesh>

        {/* Structural Under-Desk Crossbar & Cable Raceway */}
        <mesh position={[0, 1.1, -0.6]} receiveShadow castShadow>
          <boxGeometry args={[5.8, 0.18, 0.35]} />
          <meshStandardMaterial color="#0f0f13" roughness={0.8} />
        </mesh>
      </group>

      {/* ── Acoustic Felt Privacy Divider (Rear of desk) ── */}
      <group position={[0, 3.55, -1.5]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[isExecutive ? 7.4 : 6.4, 1.15, 0.08]} />
          <meshStandardMaterial color="#1b1b22" roughness={0.94} />
        </mesh>
        {/* Anodized Steel Mounting Clamps */}
        <mesh position={[-2.4, -0.55, 0]} castShadow>
          <boxGeometry args={[0.12, 0.3, 0.14]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.85} />
        </mesh>
        <mesh position={[2.4, -0.55, 0]} castShadow>
          <boxGeometry args={[0.12, 0.3, 0.14]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.85} />
        </mesh>
      </group>
    </group>
  );
}
