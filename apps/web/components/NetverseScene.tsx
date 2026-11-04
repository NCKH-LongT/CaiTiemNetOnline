'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import GamingStation from './GamingStation';
import { canMoveTo, nearestStation, stations, type Point3 } from '@/lib/stations';

export type RemotePlayer = { id: string; x: number; z: number; seatedAt: number | null; name: string };

type Props = {
  heldKeys: React.RefObject<Set<string>>;
  seatedAt: number | null;
  occupiedSeats: Record<number, string>;
  remotePlayers: RemotePlayer[];
  sessionId: string | null;
  onNearbyChange: (stationId: number | null) => void;
  onPositionChange: (x: number, z: number) => void;
  onMove: (x: number, z: number) => void;
  onScreenClick: (stationId: number) => void;
};

function Avatar({ position, seated = false, color = '#72f2cc', movement }: { position: Point3; seated?: boolean; color?: string; movement?: React.RefObject<number> }) {
  const body = useRef<THREE.Mesh>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!movement) return;
    const speed = movement.current;
    const phase = clock.getElapsedTime() * (speed > 1 ? 13 : 8);
    if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(phase) * 0.45 * speed;
    if (rightLeg.current) rightLeg.current.rotation.x = -Math.sin(phase) * 0.45 * speed;
    if (body.current) body.current.position.y = (seated ? 0.81 : 0.96) + Math.sin(clock.getElapsedTime() * 2) * 0.015;
  });
  return (
    <group position={position}>
      <mesh ref={body} position={[0, seated ? 0.81 : 0.96, 0]} castShadow>
        <capsuleGeometry args={[0.23, seated ? 0.3 : 0.48, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, seated ? 1.3 : 1.53, 0]} castShadow>
        <sphereGeometry args={[0.19, 10, 8]} />
        <meshStandardMaterial color="#edc5aa" />
      </mesh>
      <mesh position={[0, seated ? 1.48 : 1.72, 0]}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color="#312d52" />
      </mesh>
      {seated ? null : [-0.11, 0.11].map((leg) => (
        <mesh key={leg} ref={leg < 0 ? leftLeg : rightLeg} position={[leg, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.42, 3, 6]} />
          <meshStandardMaterial color="#252837" />
        </mesh>
      ))}
    </group>
  );
}

function RoomShell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 14]} />
        <meshStandardMaterial color="#252634" roughness={0.95} />
      </mesh>
      <gridHelper args={[12, 12, '#4c4564', '#343645']} position={[0, 0.008, 0]} />
      <mesh position={[0, 1.7, -7]} receiveShadow>
        <boxGeometry args={[12, 3.4, 0.18]} />
        <meshStandardMaterial color="#29243a" />
      </mesh>
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} receiveShadow>
          <boxGeometry args={[0.18, 3.4, 14]} />
          <meshStandardMaterial color="#242231" />
        </mesh>
      ))}
      <mesh position={[0, 2.6, -6.86]}>
        <boxGeometry args={[3.3, 0.62, 0.06]} />
        <meshBasicMaterial color="#564298" />
      </mesh>
      {[-4.2, 0, 4.2].map((z) => (
        <group key={z} position={[0, 3.1, z]}>
          <mesh>
            <boxGeometry args={[1.4, 0.08, 0.4]} />
            <meshBasicMaterial color="#ad9ae8" />
          </mesh>
          <pointLight color="#b68cff" intensity={10} distance={5} decay={2} />
        </group>
      ))}
      <mesh position={[0, 0.35, -6.15]}>
        <boxGeometry args={[2.1, 0.7, 0.65]} />
        <meshStandardMaterial color="#4d3e64" />
      </mesh>
      <mesh position={[0, 0.78, -6.15]}>
        <boxGeometry args={[2.18, 0.08, 0.72]} />
        <meshStandardMaterial color="#a88dd3" />
      </mesh>
    </group>
  );
}

function World(props: Props) {
  const { camera } = useThree();
  const avatarGroup = useRef<THREE.Group>(null);
  const avatarPosition = useRef<Point3>([0, 0, 5.7]);
  const movementAmount = useRef(0);
  const lastNearby = useRef<number | null>(null);
  const lastMoveSend = useRef(0);
  const target = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const seatedStation = props.seatedAt ? stations[props.seatedAt - 1] : null;

  useFrame((_, delta) => {
    const position = avatarPosition.current;
    movementAmount.current = 0;
    if (!seatedStation) {
      let dx = Number(props.heldKeys.current.has('d') || props.heldKeys.current.has('arrowright')) - Number(props.heldKeys.current.has('a') || props.heldKeys.current.has('arrowleft'));
      let dz = Number(props.heldKeys.current.has('s') || props.heldKeys.current.has('arrowdown')) - Number(props.heldKeys.current.has('w') || props.heldKeys.current.has('arrowup'));
      if (dx || dz) {
        movementAmount.current = props.heldKeys.current.has('shift') ? 1.7 : 1;
        const length = Math.hypot(dx, dz);
        dx /= length;
        dz /= length;
        const speed = props.heldKeys.current.has('shift') ? 5 : 3.1;
        const nextX = position[0] + dx * speed * Math.min(delta, 0.05);
        const nextZ = position[2] + dz * speed * Math.min(delta, 0.05);
        const x = canMoveTo(nextX, position[2]) ? nextX : position[0];
        const z = canMoveTo(x, nextZ) ? nextZ : position[2];
        avatarPosition.current = [x, 0, z];
        props.onPositionChange(x, z);
        if (avatarGroup.current) avatarGroup.current.rotation.y = Math.atan2(dx, dz);
        const now = performance.now();
        if (now - lastMoveSend.current > 100) {
          props.onMove(x, z);
          lastMoveSend.current = now;
        }
      }
    }
    const current = avatarPosition.current;
    const nearby = seatedStation ? null : nearestStation(current[0], current[2])?.stationId ?? null;
    if (nearby !== lastNearby.current) {
      lastNearby.current = nearby;
      props.onNearbyChange(nearby);
    }
    if (avatarGroup.current) {
      avatarGroup.current.position.set(...(seatedStation?.seatAnchor ?? current));
    }
    if (seatedStation) {
      const side = Math.sign(seatedStation.position[0]);
      target.current.set(seatedStation.seatAnchor[0] - side * 0.3, 2.5, seatedStation.seatAnchor[2] + 2.3);
      cameraTarget.current.set(...seatedStation.screenAnchor);
    } else {
      target.current.set(current[0] + 5.8, 8.2, current[2] + 8.7);
      cameraTarget.current.set(current[0], 0.5, current[2] - 0.7);
    }
    camera.position.lerp(target.current, Math.min(1, delta * 3.2));
    camera.lookAt(cameraTarget.current);
  });

  return (
    <>
      <color attach="background" args={['#191827']} />
      <fog attach="fog" args={['#191827', 18, 35]} />
      <ambientLight intensity={1.3} color="#c7b4ec" />
      <directionalLight position={[4, 9, 6]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <RoomShell />
      {stations.map((station) => (
        <GamingStation
          key={station.stationId}
          station={station}
          active={props.seatedAt === station.stationId}
          occupied={Boolean(props.occupiedSeats[station.stationId])}
          onScreenClick={props.onScreenClick}
        />
      ))}
      <group ref={avatarGroup}><Avatar position={[0, 0, 0]} seated={Boolean(seatedStation)} movement={movementAmount} /></group>
      {props.remotePlayers.filter((player) => player.id !== props.sessionId).map((player) => {
        const station = player.seatedAt ? stations[player.seatedAt - 1] : null;
        return <Avatar key={player.id} position={station?.seatAnchor ?? [player.x, 0, player.z]} seated={Boolean(station)} color="#e1a5e9" />;
      })}
    </>
  );
}

export default function NetverseScene(props: Props) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [5.8, 8.2, 13.5], fov: 48 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <World {...props} />
    </Canvas>
  );
}
