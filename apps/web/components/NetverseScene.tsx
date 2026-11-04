'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GamingStation from './GamingStation';
import AssetErrorBoundary from './AssetErrorBoundary';
import { canMoveTo, nearestStation, stations, worldBounds, type Point3 } from '@/lib/stations';

export type RemotePlayer = {
  id: string;
  userId?: string;
  x: number;
  z: number;
  seatedAt: number | null;
  name: string;
  fullname?: string;
  avatarUrl?: string | null;
  balanceSeconds?: number;
};

type Props = {
  heldKeys: React.RefObject<Set<string>>;
  seatedAt: number | null;
  occupiedSeats: Record<number, string>;
  remotePlayers: RemotePlayer[];
  sessionId: string | null;
  startPosition: Point3;
  kneeling: boolean;
  canEnterCafe: boolean;
  localName?: string;
  localFullname?: string;
  localAvatarUrl?: string | null;
  leaderboard?: {
    rich: { nickname: string; balance_seconds: number }[];
    donors: { nickname: string; donated_seconds: number }[];
  };
  onNearbyChange: (stationId: number | null) => void;
  onPositionChange: (x: number, z: number) => void;
  onMove: (x: number, z: number) => void;
  onScreenClick: (stationId: number) => void;
};

function AvatarTag({
  name,
  fullname,
  avatarUrl,
}: {
  name: string;
  fullname?: string;
  avatarUrl?: string | null;
}) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    const paint = (portrait?: HTMLImageElement) => {
      context.clearRect(0, 0, 512, 128);
      context.fillStyle = 'rgba(25,22,45,0.88)';
      context.beginPath();
      context.roundRect(0, 0, 512, 128, 22);
      context.fill();
      if (portrait) {
        context.save();
        context.beginPath();
        context.arc(60, 64, 44, 0, Math.PI * 2);
        context.clip();
        context.drawImage(portrait, 16, 20, 88, 88);
        context.restore();
      } else {
        context.fillStyle = '#7661b8';
        context.beginPath();
        context.arc(60, 64, 44, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff';
        context.font = 'bold 44px sans-serif';
        context.fillText(name.slice(0, 1).toUpperCase(), 45, 79);
      }
      context.fillStyle = '#fff';
      context.font = 'bold 29px sans-serif';
      context.fillText(name.slice(0, 20), 122, 61);
      context.fillStyle = '#b9acd4';
      context.font = '20px sans-serif';
      context.fillText((fullname || '').slice(0, 29), 122, 92);
      const next = new THREE.CanvasTexture(canvas);
      setTexture((old) => {
        old?.dispose();
        return next;
      });
    };
    paint();
    if (avatarUrl) {
      const image = new Image();
      image.onload = () => paint(image);
      image.src = avatarUrl;
    }
    return () =>
      setTexture((old) => {
        old?.dispose();
        return null;
      });
  }, [name, fullname, avatarUrl]);
  return texture ? (
    <sprite position={[0, 2.25, 0]} scale={[1.9, 0.48, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  ) : null;
}

type WorldObject = {
  id: string;
  asset_url: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
};
function WorldAsset({ object }: { object: WorldObject }) {
  const gltf = useLoader(GLTFLoader, object.asset_url);
  return (
    <group
      position={[object.x, object.y, object.z]}
      rotation={[0, object.rotation, 0]}
      scale={object.scale}
    >
      <primitive object={gltf.scene.clone()} />
    </group>
  );
}

function LeaderboardBoard({ data }: { data?: Props['leaderboard'] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#231c3c';
    context.fillRect(0, 0, 1024, 512);
    context.strokeStyle = '#a480f0';
    context.lineWidth = 14;
    context.strokeRect(0, 0, 1024, 512);
    context.fillStyle = '#f4ecff';
    context.font = 'bold 48px sans-serif';
    context.fillText('NETVERSE · BẢNG VÀNG', 45, 75);
    context.font = 'bold 30px sans-serif';
    context.fillStyle = '#9debd2';
    context.fillText('ĐẠI GIA PHÚT CHƠI', 45, 135);
    context.fillText('NGƯỜI CỨU NET', 530, 135);
    context.font = '26px sans-serif';
    context.fillStyle = '#f4ecff';
    (data?.rich || [])
      .slice(0, 5)
      .forEach((item, index) =>
        context.fillText(
          `${index + 1}. ${item.nickname.slice(0, 18)} · ${Math.floor(item.balance_seconds / 60)}p`,
          45,
          185 + index * 55,
        ),
      );
    (data?.donors || [])
      .slice(0, 5)
      .forEach((item, index) =>
        context.fillText(
          `${index + 1}. ${item.nickname.slice(0, 18)} · ${Math.floor(item.donated_seconds / 60)}p`,
          530,
          185 + index * 55,
        ),
      );
    return new THREE.CanvasTexture(canvas);
  }, [data]);
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );
  return (
    <group position={[0, 3.2, -22.5]}>
      <mesh>
        <boxGeometry args={[8.3, 4.3, 0.2]} />
        <meshStandardMaterial color="#171228" />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.12]}>
          <planeGeometry args={[8, 4]} />
          <meshBasicMaterial map={texture} />
        </mesh>
      )}
    </group>
  );
}

function Avatar({
  position,
  seated = false,
  kneeling = false,
  color = '#72f2cc',
  movement,
  name,
  fullname,
  avatarUrl,
}: {
  position: Point3;
  seated?: boolean;
  kneeling?: boolean;
  color?: string;
  movement?: React.RefObject<number>;
  name?: string;
  fullname?: string;
  avatarUrl?: string | null;
}) {
  const body = useRef<THREE.Mesh>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!movement) return;
    const speed = movement.current;
    const phase = clock.getElapsedTime() * (speed > 1 ? 13 : 8);
    if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(phase) * 0.45 * speed;
    if (rightLeg.current) rightLeg.current.rotation.x = -Math.sin(phase) * 0.45 * speed;
    if (body.current)
      body.current.position.y =
        (seated ? 0.81 : kneeling ? 0.55 : 0.96) + Math.sin(clock.getElapsedTime() * 2) * 0.015;
  });
  return (
    <group position={position}>
      <mesh ref={body} position={[0, seated ? 0.81 : kneeling ? 0.55 : 0.96, 0]} castShadow>
        <capsuleGeometry args={[0.23, seated ? 0.3 : 0.48, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, seated ? 1.3 : kneeling ? 0.9 : 1.53, 0]} castShadow>
        <sphereGeometry args={[0.19, 10, 8]} />
        <meshStandardMaterial color="#edc5aa" />
      </mesh>
      <mesh position={[0, seated ? 1.48 : kneeling ? 1.08 : 1.72, 0]}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color="#312d52" />
      </mesh>
      {seated
        ? null
        : [-0.11, 0.11].map((leg) => (
            <mesh key={leg} ref={leg < 0 ? leftLeg : rightLeg} position={[leg, 0.35, 0]} castShadow>
              <capsuleGeometry args={[0.075, kneeling ? 0.23 : 0.42, 3, 6]} />
              <meshStandardMaterial color="#252837" />
            </mesh>
          ))}
      {name && <AvatarTag name={name} fullname={fullname} avatarUrl={avatarUrl} />}
    </group>
  );
}

function RoomShell() {
  const width = worldBounds.halfWidth * 2 + 1.8;
  const length = worldBounds.halfLength * 2 + 1.8;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#252634" roughness={0.95} />
      </mesh>
      <gridHelper
        args={[Math.max(width, length), 50, '#4c4564', '#343645']}
        position={[0, 0.008, 0]}
      />
      <mesh position={[0, 1.7, -length / 2]} receiveShadow>
        <boxGeometry args={[width, 3.4, 0.18]} />
        <meshStandardMaterial color="#29243a" />
      </mesh>
      {[-width / 2, width / 2].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} receiveShadow>
          <boxGeometry args={[0.18, 3.4, length]} />
          <meshStandardMaterial color="#242231" />
        </mesh>
      ))}
      {[-18, -9, 0, 9, 18].map((z) => (
        <group key={z} position={[0, 3.1, z]}>
          <mesh>
            <boxGeometry args={[width - 2, 0.08, 0.28]} />
            <meshBasicMaterial color="#ad9ae8" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.7, -length / 2 + 0.12]}>
        <boxGeometry args={[8, 1.5, 0.08]} />
        <meshBasicMaterial color="#392660" />
      </mesh>
      <mesh position={[0, 0.4, -length / 2 + 0.55]}>
        <boxGeometry args={[8.4, 0.8, 0.55]} />
        <meshStandardMaterial color="#4d3e64" />
      </mesh>
    </group>
  );
}

function World(props: Props) {
  const { camera } = useThree();
  const avatarGroup = useRef<THREE.Group>(null);
  const avatarPosition = useRef<Point3>([...props.startPosition]);
  const heading = useRef(Math.PI);
  const visibleCell = useRef('');
  const [visibleStations, setVisibleStations] = useState(() =>
    stations.filter(
      (station) =>
        Math.hypot(
          station.position[0] - props.startPosition[0],
          station.position[2] - props.startPosition[2],
        ) < 13,
    ),
  );
  const [visibleCenter, setVisibleCenter] = useState<Point3>([...props.startPosition]);
  const [worldObjects, setWorldObjects] = useState<WorldObject[]>([]);
  const movementAmount = useRef(0);
  const lastNearby = useRef<number | null>(null);
  const lastMoveSend = useRef(0);
  const target = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const seatedStation = props.seatedAt ? stations[props.seatedAt - 1] : null;
  useEffect(() => {
    const load = () =>
      fetch('/api/world')
        .then((response) => response.json())
        .then((result) => setWorldObjects(result.objects || []))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  useFrame((_, delta) => {
    const position = avatarPosition.current;
    movementAmount.current = 0;
    if (!seatedStation && !props.kneeling) {
      let dx =
        Number(props.heldKeys.current.has('d') || props.heldKeys.current.has('arrowright')) -
        Number(props.heldKeys.current.has('a') || props.heldKeys.current.has('arrowleft'));
      let dz =
        Number(props.heldKeys.current.has('s') || props.heldKeys.current.has('arrowdown')) -
        Number(props.heldKeys.current.has('w') || props.heldKeys.current.has('arrowup'));
      if (dx || dz) {
        movementAmount.current = props.heldKeys.current.has('shift') ? 1.7 : 1;
        const length = Math.hypot(dx, dz);
        dx /= length;
        dz /= length;
        const speed = props.heldKeys.current.has('shift') ? 5 : 3.1;
        const nextX = position[0] + dx * speed * Math.min(delta, 0.05);
        const nextZ = position[2] + dz * speed * Math.min(delta, 0.05);
        const x = canMoveTo(nextX, position[2]) ? nextX : position[0];
        const z = canMoveTo(x, nextZ) && (props.canEnterCafe || nextZ >= 25) ? nextZ : position[2];
        avatarPosition.current = [x, 0, z];
        props.onPositionChange(x, z);
        heading.current = Math.atan2(dx, dz);
        if (avatarGroup.current) avatarGroup.current.rotation.y = heading.current;
        const now = performance.now();
        if (now - lastMoveSend.current > 100) {
          props.onMove(x, z);
          lastMoveSend.current = now;
        }
      }
    }
    const current = avatarPosition.current;
    const cell = `${Math.floor(current[0] / 4)}:${Math.floor(current[2] / 4)}`;
    if (cell !== visibleCell.current) {
      visibleCell.current = cell;
      setVisibleCenter([...current]);
      setVisibleStations(
        stations.filter(
          (station) =>
            Math.hypot(station.position[0] - current[0], station.position[2] - current[2]) < 13,
        ),
      );
    }
    const nearby = seatedStation
      ? null
      : (nearestStation(current[0], current[2])?.stationId ?? null);
    if (nearby !== lastNearby.current) {
      lastNearby.current = nearby;
      props.onNearbyChange(nearby);
    }
    if (avatarGroup.current) {
      avatarGroup.current.position.set(...(seatedStation?.seatAnchor ?? current));
    }
    if (seatedStation) {
      const side = seatedStation.side;
      target.current.set(
        seatedStation.seatAnchor[0] - side * 0.15,
        1.65,
        seatedStation.seatAnchor[2] + 0.2,
      );
      cameraTarget.current.set(...seatedStation.screenAnchor);
    } else {
      target.current.set(
        current[0] - Math.sin(heading.current) * 3.3,
        2.6,
        current[2] - Math.cos(heading.current) * 3.3,
      );
      cameraTarget.current.set(
        current[0] + Math.sin(heading.current) * 2,
        1.2,
        current[2] + Math.cos(heading.current) * 2,
      );
    }
    camera.position.lerp(target.current, Math.min(1, delta * 3.2));
    camera.lookAt(cameraTarget.current);
  });

  return (
    <>
      <color attach="background" args={['#191827']} />
      <fog attach="fog" args={['#191827', 25, 48]} />
      <ambientLight intensity={1.3} color="#c7b4ec" />
      <directionalLight
        position={[4, 9, 6]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <RoomShell />
      <LeaderboardBoard data={props.leaderboard} />
      <Suspense fallback={null}>
        {worldObjects
          .filter(
            (object) => Math.hypot(object.x - visibleCenter[0], object.z - visibleCenter[2]) < 25,
          )
          .map((object) => (
            <AssetErrorBoundary key={object.id}>
              <WorldAsset object={object} />
            </AssetErrorBoundary>
          ))}
      </Suspense>
      {visibleStations.map((station) => (
        <GamingStation
          key={station.stationId}
          station={station}
          active={props.seatedAt === station.stationId}
          occupied={Boolean(props.occupiedSeats[station.stationId])}
          onScreenClick={props.onScreenClick}
        />
      ))}
      <group ref={avatarGroup}>
        <Avatar
          position={[0, 0, 0]}
          seated={Boolean(seatedStation)}
          kneeling={props.kneeling}
          movement={movementAmount}
          name={seatedStation ? undefined : props.localName}
          fullname={props.localFullname}
          avatarUrl={props.localAvatarUrl}
        />
      </group>
      {props.remotePlayers
        .filter(
          (player) =>
            player.id !== props.sessionId &&
            Math.hypot(player.x - visibleCenter[0], player.z - visibleCenter[2]) < 25,
        )
        .map((player) => {
          const station = player.seatedAt ? stations[player.seatedAt - 1] : null;
          return (
            <Avatar
              key={player.id}
              position={station?.seatAnchor ?? [player.x, 0, player.z]}
              seated={Boolean(station)}
              color="#e1a5e9"
              name={player.name}
              fullname={player.fullname}
              avatarUrl={player.avatarUrl}
            />
          );
        })}
    </>
  );
}

export default function NetverseScene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 2.6, 26.3], fov: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <World {...props} />
    </Canvas>
  );
}
