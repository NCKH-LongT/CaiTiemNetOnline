'use client';

import type { ThreeEvent } from '@react-three/fiber';
import type { Station } from '@/lib/stations';

type Props = {
  station: Station;
  active: boolean;
  occupied: boolean;
  onScreenClick: (stationId: number) => void;
};

export default function GamingStation({ station, active, occupied, onScreenClick }: Props) {
  const side = Math.sign(station.position[0]);
  const [x, , z] = station.position;
  const handleScreenClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onScreenClick(station.stationId);
  };

  return (
    <group position={[x, 0, z]}>
      {/* Desk, case, monitor, keyboard and mouse are original procedural meshes. */}
      <mesh position={[0, 0.77, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.04, 0.1, 1.62]} />
        <meshStandardMaterial color="#39333c" roughness={0.7} />
      </mesh>
      {[-0.45, 0.45].map((legX) => (
        <mesh key={legX} position={[legX, 0.38, 0]} castShadow>
          <boxGeometry args={[0.08, 0.76, 1.4]} />
          <meshStandardMaterial color="#191820" metalness={0.35} />
        </mesh>
      ))}
      <mesh position={[side * 0.37, 1.03, -0.52]} castShadow>
        <boxGeometry args={[0.34, 0.42, 0.4]} />
        <meshStandardMaterial color="#151620" metalness={0.45} />
      </mesh>
      <mesh position={[side * 0.37, 1.02, -0.74]}>
        <boxGeometry args={[0.25, 0.24, 0.012]} />
        <meshStandardMaterial color="#8d63ff" emissive="#6a3ee5" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 1.11, 0.03]} castShadow>
        <boxGeometry args={[0.08, 0.59, 0.08]} />
        <meshStandardMaterial color="#181720" />
      </mesh>
      <mesh position={[0, 1.36, 0.03]}>
        <boxGeometry args={[0.06, 0.46, 0.73]} />
        <meshStandardMaterial color="#10111a" metalness={0.4} />
      </mesh>
      <mesh position={[-side * 0.037, 1.36, 0.03]} rotation={[0, -side * Math.PI / 2, 0]} onClick={handleScreenClick}>
        <planeGeometry args={[0.65, 0.38]} />
        <meshBasicMaterial color={active ? '#71f6d2' : occupied ? '#fb8c9b' : '#7857ce'} />
      </mesh>
      <mesh position={[-side * 0.31, 0.85, -0.03]}>
        <boxGeometry args={[0.18, 0.025, 0.54]} />
        <meshStandardMaterial color="#aca2c1" />
      </mesh>
      <mesh position={[-side * 0.31, 0.85, 0.37]}>
        <boxGeometry args={[0.13, 0.04, 0.08]} />
        <meshStandardMaterial color="#bdb4cb" />
      </mesh>
      {/* Chair and seat anchor face the aisle. */}
      <group position={[-side * 1.12, 0, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.55, 0.12, 0.56]} />
          <meshStandardMaterial color="#6153ba" />
        </mesh>
        <mesh position={[-side * 0.23, 0.83, 0]} castShadow>
          <boxGeometry args={[0.12, 0.77, 0.58]} />
          <meshStandardMaterial color="#5547a6" />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.42, 6]} />
          <meshStandardMaterial color="#24232c" />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.06, 8]} />
          <meshStandardMaterial color="#24232c" />
        </mesh>
      </group>
      <mesh position={[-side * 0.51, 0.805, 0]}>
        <boxGeometry args={[0.025, 0.025, 1.48]} />
        <meshBasicMaterial color={occupied ? '#fa7d95' : active ? '#75ffde' : '#8561ed'} />
      </mesh>
    </group>
  );
}
