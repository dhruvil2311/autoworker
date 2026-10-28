import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function ServerRack({ position = [0, 0, 0], isActive = false }: { position?: [number, number, number], isActive?: boolean }) {
  const ledMeshRef = useRef<THREE.InstancedMesh>(null);
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (glowLightRef.current && isActive) {
      glowLightRef.current.intensity = 1.2 + Math.sin(state.clock.elapsedTime * 4) * 0.4;
    }
  });

  return (
    <group position={position}>
      {/* Outer Cabinet */}
      <mesh position={[0, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.5, 8, 3.5]} />
        <meshStandardMaterial color="#0a0a0f" roughness={0.3} metalness={0.85} />
      </mesh>
      
      {/* Smoked Glass Front Door */}
      <mesh position={[0, 4, 1.76]} castShadow receiveShadow>
        <boxGeometry args={[3.3, 7.8, 0.05]} />
        <meshPhysicalMaterial 
          color="#050810" 
          transmission={0.85} 
          opacity={1} 
          transparent 
          roughness={0.15} 
          ior={1.5} 
        />
      </mesh>

      {/* Internal Active Core Point Light */}
      <pointLight ref={glowLightRef} position={[0, 4, 1.2]} intensity={isActive ? 1.5 : 0.2} color="#00c2d4" distance={8} />

      {/* Rack Units (Servers) */}
      {[...Array(6)].map((_, i) => (
        <group key={`ru-${i}`} position={[0, 1.5 + i * 1.1, 1.4]}>
          <mesh castShadow>
            <boxGeometry args={[3, 0.8, 2.5]} />
            <meshStandardMaterial color="#14141e" roughness={0.6} metalness={0.6} />
          </mesh>
          {/* Status Indicator LED */}
          <mesh position={[-1.2, 0, 1.26]}>
            <boxGeometry args={[0.2, 0.1, 0.05]} />
            <meshStandardMaterial 
              color={isActive ? "#00c2d4" : "#333"} 
              emissive={isActive ? "#00c2d4" : "#000"} 
              emissiveIntensity={isActive ? 2.5 : 0} 
              toneMapped={false} 
            />
          </mesh>
          {/* Data Transfer Blinking Array */}
          <mesh position={[1.0, 0, 1.26]}>
            <boxGeometry args={[0.7, 0.08, 0.05]} />
            <meshStandardMaterial 
              color={isActive ? (i % 2 === 0 ? "#1db87a" : "#00c2d4") : "#333"} 
              emissive={isActive ? (i % 2 === 0 ? "#1db87a" : "#00c2d4") : "#000"} 
              emissiveIntensity={isActive ? 2 : 0} 
              toneMapped={false} 
            />
          </mesh>
          {/* Honeycomb Ventilation Grille */}
          <mesh position={[0, 0, 1.26]}>
            <boxGeometry args={[1.2, 0.5, 0.02]} />
            <meshStandardMaterial color="#08080c" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

