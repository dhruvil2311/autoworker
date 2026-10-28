import React from 'react';

// ── Real-World Scale Calibration: 1 unit = 1.0 meter ──

// ── Architectural Potted Plant (Height: ~1.10m total) ──
export function PottedPlant({
  position = [0, 0, 0],
  scale = 1,
}: {
  position?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Fluted Matte Terracotta/Ceramic Planter */}
      <mesh position={[0, 0.20, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.40, 20]} />
        <meshStandardMaterial color="#c87e60" roughness={0.7} />
      </mesh>
      {/* Inset Organic Soil Bed */}
      <mesh position={[0, 0.38, 0]} receiveShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
        <meshStandardMaterial color="#261a12" roughness={0.95} />
      </mesh>
      {/* Central Woody Stalk extending from soil */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.020, 0.55, 10]} />
        <meshStandardMaterial color="#422c1b" roughness={0.85} />
      </mesh>
      {/* Vibrant Lush Botanical Canopy */}
      <group position={[0, 0.42, 0]}>
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i * Math.PI * 2) / 5 + 0.2;
          const yHeight = 0.15 + i * 0.09;
          return (
            <group key={`p-leaf-${i}`} position={[0, yHeight, 0]} rotation={[0.18, angle, 0.15]}>
              {/* Petiole Stem */}
              <mesh position={[0.08, 0, 0]} rotation={[0, 0, -0.15]} castShadow>
                <cylinderGeometry args={[0.003, 0.005, 0.16, 8]} />
                <meshStandardMaterial color="#35582c" roughness={0.7} />
              </mesh>
              {/* Vibrant Broad Leaf Blade */}
              <mesh position={[0.22, 0.02, 0]} rotation={[0, 0, -0.22]} castShadow>
                <boxGeometry args={[0.22, 0.005, 0.12]} />
                <meshStandardMaterial color={i % 2 === 0 ? '#2e7539' : '#3d8847'} roughness={0.38} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ── Architectural Task Lamp (Anchored on desk, height: 0.46m) ──
export function DeskLamp({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Brushed Brass Base */}
      <mesh position={[0, 0.008, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.085, 0.016, 20]} />
        <meshStandardMaterial color="#bfa060" roughness={0.28} metalness={0.88} />
      </mesh>
      {/* Stem */}
      <mesh position={[-0.03, 0.20, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.38, 12]} />
        <meshStandardMaterial color="#bfa060" metalness={0.88} roughness={0.28} />
      </mesh>
      {/* Upper Articulated Arm */}
      <mesh position={[0.05, 0.38, 0]} rotation={[0, 0, -0.4]} castShadow>
        <cylinderGeometry args={[0.007, 0.007, 0.26, 12]} />
        <meshStandardMaterial color="#bfa060" metalness={0.88} roughness={0.28} />
      </mesh>
      {/* Conical Lamp Shade */}
      <mesh position={[0.16, 0.44, 0]} rotation={[0, 0, -1.0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 0.12, 16]} />
        <meshStandardMaterial color="#22252e" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Warm Ambient Task Glow */}
      <pointLight position={[0.18, 0.40, 0]} intensity={0.9} distance={2.4} color="#ffe8bd" decay={2} />
    </group>
  );
}

// ── Glazed Ceramic Coffee Mug ──
export function CoffeeMug({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.048, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.038, 0.095, 18]} />
        <meshStandardMaterial color="#f2eee8" roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.088, 0]}>
        <cylinderGeometry args={[0.038, 0.038, 0.005, 16]} />
        <meshStandardMaterial color="#301808" roughness={0.2} />
      </mesh>
      <mesh position={[0.048, 0.048, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.026, 0.007, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#f2eee8" roughness={0.25} />
      </mesh>
    </group>
  );
}

// ── A5 Leather Notebook & Precision Pen ──
export function NotebookAndPen({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.007, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.15, 0.014, 0.21]} />
        <meshStandardMaterial color="#2d2218" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.015, 0.105]}>
        <boxGeometry args={[0.02, 0.003, 0.03]} />
        <meshStandardMaterial color="#e08a3c" />
      </mesh>
      <mesh position={[0.10, 0.006, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.004, 0.004, 0.14, 12]} />
        <meshStandardMaterial color="#c0c0c8" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ── Document Paper Stack ──
export function PaperStack({
  position = [0, 0, 0],
  count = 3,
}: {
  position?: [number, number, number];
  count?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.008, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.24, 0.016, 0.33]} />
        <meshStandardMaterial color="#323642" roughness={0.5} metalness={0.4} />
      </mesh>
      {[...Array(count)].map((_, i) => (
        <mesh
          key={`paper-${i}`}
          position={[0, 0.016 + i * 0.006, 0]}
          rotation={[0, i * 0.02 - 0.01, 0]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[0.21, 0.004, 0.297]} />
          <meshStandardMaterial color="#f4f2ec" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ── Luxury Cognac Leather Executive Lounge Sofa ──
export function ModernLoungeSofa({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Saddle Leather Base Chassis */}
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.22, 0.85]} />
        <meshStandardMaterial color="#824c28" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Cognac Leather Seat Cushions */}
      {[-0.52, 0.52].map((x, i) => (
        <mesh key={`cushion-${i}`} position={[x, 0.38, 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.98, 0.14, 0.72]} />
          <meshStandardMaterial color="#945730" roughness={0.52} metalness={0.05} />
        </mesh>
      ))}
      {/* Tufted Leather Backrest Cushions */}
      {[-0.52, 0.52].map((x, i) => (
        <mesh key={`back-${i}`} position={[x, 0.65, -0.32]} castShadow receiveShadow>
          <boxGeometry args={[0.98, 0.42, 0.18]} />
          <meshStandardMaterial color="#8a502a" roughness={0.55} metalness={0.05} />
        </mesh>
      ))}
      {/* Leather Wrapped Armrests */}
      {[-1.02, 1.02].map((x, i) => (
        <mesh key={`arm-${i}`} position={[x, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 0.34, 0.85]} />
          <meshStandardMaterial color="#824c28" roughness={0.55} metalness={0.05} />
        </mesh>
      ))}
      {/* Champagne Bronze Tapered Legs */}
      {[
        [-0.95, -0.35],
        [0.95, -0.35],
        [-0.95, 0.35],
        [0.95, 0.35],
      ].map((leg, i) => (
        <mesh key={`sofa-leg-${i}`} position={[leg[0] ?? 0, 0.05, leg[1] ?? 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.012, 0.10, 12]} />
          <meshStandardMaterial color="#7a634e" metalness={0.88} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

// ── Honed Calacatta Marble Lounge Coffee Table ──
export function LoungeCoffeeTable({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Honed Calacatta Italian White Marble Slab */}
      <mesh position={[0, 0.41, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.035, 0.60]} />
        <meshStandardMaterial color="#ebe7df" roughness={0.28} metalness={0.08} />
      </mesh>
      {/* Champagne Bronze Perimeter Apron */}
      <mesh position={[0, 0.388, 0]}>
        <boxGeometry args={[1.18, 0.015, 0.58]} />
        <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
      </mesh>
      {/* Champagne Bronze Square Tube Legs */}
      {[
        [-0.52, -0.24],
        [0.52, -0.24],
        [-0.52, 0.24],
        [0.52, 0.24],
      ].map((leg, i) => (
        <mesh key={`table-leg-${i}`} position={[leg[0] ?? 0, 0.2, leg[1] ?? 0]} castShadow>
          <boxGeometry args={[0.03, 0.40, 0.03]} />
          <meshStandardMaterial color="#685441" metalness={0.85} roughness={0.35} />
        </mesh>
      ))}
      {/* Design Art Book on Table */}
      <mesh position={[-0.22, 0.435, 0.05]} rotation={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.26, 0.018, 0.32]} />
        <meshStandardMaterial color="#9e3223" roughness={0.7} />
      </mesh>
      <CoffeeMug position={[0.25, 0.428, -0.1]} />
    </group>
  );
}

// ── Water Cooler & Hydration Station ──
export function WaterCooler({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 1.10, 0.34]} />
        <meshStandardMaterial color="#161820" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.65, 0.171]} castShadow>
        <boxGeometry args={[0.26, 0.55, 0.008]} />
        <meshStandardMaterial color="#303542" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.14, 0.32, 16]} />
        <meshPhysicalMaterial
          color="#3888cc"
          transmission={0.7}
          roughness={0.1}
          thickness={0.5}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  );
}

// ── Large Architectural Floor Plant (Monstera / Fiddle Leaf) ──
export function LargeFloorPlant({
  position = [0, 0, 0],
  scale = 1,
}: {
  position?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Fluted Architectural Matte White Ceramic Planter */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.56, 20]} />
        <meshStandardMaterial color="#ded8cf" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.54, 0]} receiveShadow>
        <cylinderGeometry args={[0.20, 0.20, 0.04, 16]} />
        <meshStandardMaterial color="#261a12" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.03, 1.0, 12]} />
        <meshStandardMaterial color="#422c1b" roughness={0.85} />
      </mesh>
      <group position={[0, 0.55, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i * Math.PI * 2) / 6 + 0.15;
          const yHeight = 0.18 + i * 0.14;
          return (
            <group key={`large-leaf-${i}`} position={[0, yHeight, 0]} rotation={[0.22, angle, 0.18]}>
              <mesh position={[0.10, 0, 0]} rotation={[0, 0, -0.18]} castShadow>
                <cylinderGeometry args={[0.005, 0.008, 0.20, 8]} />
                <meshStandardMaterial color="#35582c" roughness={0.7} />
              </mesh>
              <mesh position={[0.26, 0.03, 0]} rotation={[0, 0, -0.25]} castShadow>
                <boxGeometry args={[0.32, 0.008, 0.18]} />
                <meshStandardMaterial color={i % 2 === 0 ? '#276d33' : '#388243'} roughness={0.38} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ── Architectural Glass Whiteboard ──
export function GlassWhiteboard({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[-0.65, 0.90, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 1.80, 12]} />
        <meshStandardMaterial color="#22222a" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0.65, 0.90, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 1.80, 12]} />
        <meshStandardMaterial color="#22222a" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.76, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 1.32, 12]} />
        <meshStandardMaterial color="#22222a" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.88, 0.012]} />
        <meshPhysicalMaterial
          color="#eef6fa"
          transmission={0.75}
          roughness={0.08}
          thickness={0.02}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}
