'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { characterUrl } from '@/lib/characters';
import GamingStation from './GamingStation';
import AssetErrorBoundary from './AssetErrorBoundary';
import { canMoveTo, nearestStation, stations, worldBounds, entranceZ, type Point3 } from '@/lib/stations';
import { formatDuration } from '@/lib/time';
import { api } from '@/lib/api';
import Image from 'next/image';

export type RemotePlayer = {
  id: string;
  userId?: string;
  x: number;
  z: number;
  seatedAt: number | null;
  name: string;
  fullname?: string;
  avatarUrl?: string | null;
  characterId?: string;
  heading?: number;
  balanceSeconds?: number;
  onlineSeconds?: number;
  badge?: string | null;
  badgeUrl?: string | null;
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
  cameraEnabled: boolean;
  localName?: string;
  localFullname?: string;
  localAvatarUrl?: string | null;
  localCharacterId?: string;
  localBalanceSeconds?: number;
  localOnlineSeconds?: number;
  localBadge?: string | null;
  localBadgeUrl?: string | null;
  wallImages: WallArt[];
  wallTotal: number;
  onWallArtClick: (image: WallArt) => void;
  orbit: React.RefObject<{ yaw: number; pitch: number }>;
  leaderboard?: {
    rich: { nickname: string; balance_seconds: number }[];
    donors: { nickname: string; donated_seconds: number }[];
    board?: { background_url: string | null; background_color: string };
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
  balanceSeconds = 0,
  onlineSeconds = 0,
  badge,
  badgeUrl,
}: {
  name: string;
  fullname?: string;
  avatarUrl?: string | null;
  balanceSeconds?: number;
  onlineSeconds?: number;
  badge?: string | null;
  badgeUrl?: string | null;
}) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let active = true;
    let portraitImage: HTMLImageElement | null = null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) return;
    const paint = (portrait?: HTMLImageElement) => {
      if (!active) return;
      context.clearRect(0, 0, 512, 180);
      context.fillStyle = 'rgba(25,22,45,0.88)';
      context.beginPath();
      context.roundRect(0, 0, 512, 180, 22);
      context.fill();
      if (portrait) {
        context.save();
        context.beginPath();
        context.arc(60, 88, 44, 0, Math.PI * 2);
        context.clip();
        context.drawImage(portrait, 16, 44, 88, 88);
        context.restore();
      } else {
        context.fillStyle = '#7661b8';
        context.beginPath();
        context.arc(60, 88, 44, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff';
        context.font = 'bold 44px sans-serif';
        context.fillText(name.slice(0, 1).toUpperCase(), 45, 103);
      }
      context.fillStyle = '#fff';
      context.font = 'bold 29px sans-serif';
      context.fillText(fullname || name, 122, 45, 370);
      context.fillStyle = '#b9acd4';
      context.font = '20px sans-serif';
      context.fillText(`@${name.slice(0, 29)}`, 122, 72);
      context.fillStyle = '#9debd2';
      context.font = '17px sans-serif';
      context.fillText(`Còn ${formatDuration(balanceSeconds)}`, 122, 107);
      context.fillText(`Online ${formatDuration(onlineSeconds)}`, 122, 130);
      if (badge && badge !== 'Tân binh') {
        context.fillStyle = '#f1d18b';
        context.font = 'bold 19px sans-serif';
        context.fillText(`✦ ${badge.slice(0, 25)}`, 122, 158);
      }
      const next = new THREE.CanvasTexture(canvas);
      setTexture((old) => {
        old?.dispose();
        return next;
      });
    };
    paint();
    if (avatarUrl) {
      const image = new window.Image();
      portraitImage = image;
      image.onload = () => paint(image);
      image.src = avatarUrl;
    }
    return () => {
      active = false;
      if (portraitImage) portraitImage.onload = null;
      setTexture((old) => {
        old?.dispose();
        return null;
      });
    };
  }, [name, fullname, avatarUrl, balanceSeconds, onlineSeconds, badge]);
  return <>
    {texture && <sprite position={[0, 2.36, 0]} scale={[1.85, 0.65, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>}
    {badgeUrl && <BadgeSprite url={badgeUrl} />}
  </>;
}

function BadgeSprite({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const lastPaint = useRef(0);
  useEffect(() => {
    const node = document.createElement('canvas');
    node.width = 128;
    node.height = 128;
    canvas.current = node;
    const next = new THREE.CanvasTexture(node);
    textureRef.current = next;
    const source = new window.Image();
    source.onload = () => { image.current = source; lastPaint.current = 0; setTexture(next); };
    source.src = url;
    return () => { source.onload = null; image.current = null; next.dispose(); textureRef.current = null; canvas.current = null; };
  }, [url]);
  useFrame(({ clock }) => {
    if (!image.current || clock.elapsedTime - lastPaint.current < (url.endsWith('.gif') ? .1 : 3600)) return;
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 128, 128);
    context.drawImage(image.current, 0, 0, 128, 128);
    if (textureRef.current) textureRef.current.needsUpdate = true;
    lastPaint.current = clock.elapsedTime;
  });
  return texture && <sprite position={[0, 3.12, 0]} scale={[.72, .72, 1]}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>;
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
type WallArt = { id: string; station_id: number; image_url: string; title: string; nickname: string };

function WallPicture({ art, index, total, onClick }: { art: WallArt; index: number; total: number; onClick: () => void }) {
  const texture = useLoader(THREE.TextureLoader, art.image_url);
  const source = texture.image as HTMLImageElement;
  const aspect = source.width && source.height ? source.width / source.height : 1;
  const width = Math.max(.65, Math.min(2.5, 5.6 / Math.sqrt(Math.max(1, total / 4))));
  const height = Math.min(1.18, width / Math.max(.25, aspect));
  const displayWidth = Math.min(width, height * aspect);
  const corner = index % 4;
  const slot = Math.floor(index / 4);
  const wallX = corner < 2 ? -worldBounds.halfWidth - .75 : worldBounds.halfWidth + .75;
  const wallZ = (corner % 2 === 0 ? -1 : 1) * (worldBounds.halfLength - 7);
  const z = wallZ + (slot % 4 - 1.5) * 2.9;
  const y = 1.1 + Math.floor(slot / 4) * 1.36;
  return <group position={[wallX, y, z]} rotation={[0, wallX < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
    <mesh onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <planeGeometry args={[displayWidth, height]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}
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

function BoardBackground({ url }: { url: string }) {
  const source = useLoader(THREE.TextureLoader, url);
  const texture = useMemo(() => {
    const copy = source.clone();
    const image = source.image as HTMLImageElement;
    const aspect = image.width / image.height;
    if (aspect > 2) {
      copy.repeat.set(2 / aspect, 1);
      copy.offset.set((1 - 2 / aspect) / 2, 0);
    } else {
      copy.repeat.set(1, aspect / 2);
      copy.offset.set(0, (1 - aspect / 2) / 2);
    }
    copy.colorSpace = THREE.SRGBColorSpace;
    copy.needsUpdate = true;
    return copy;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0, 0.113]}>
      <planeGeometry args={[8, 4]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

function LeaderboardBoard({ data }: { data?: Props['leaderboard'] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = 'rgba(15,12,30,0.72)';
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
          `${index + 1}. ${item.nickname.slice(0, 18)} · ${formatDuration(item.balance_seconds)}`,
          45,
          185 + index * 55,
        ),
      );
    (data?.donors || [])
      .slice(0, 5)
      .forEach((item, index) =>
        context.fillText(
          `${index + 1}. ${item.nickname.slice(0, 18)} · ${formatDuration(item.donated_seconds)}`,
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
    <group position={[0, 3.2, -worldBounds.halfLength + .7]}>
      <mesh>
        <boxGeometry args={[8.3, 4.3, 0.2]} />
        <meshStandardMaterial color={data?.board?.background_color || '#231c3c'} />
      </mesh>
      {data?.board?.background_url && (
        <AssetErrorBoundary>
          <Suspense fallback={null}>
            <BoardBackground url={data.board.background_url} />
          </Suspense>
        </AssetErrorBoundary>
      )}
      {texture && (
        <mesh position={[0, 0, 0.125]}>
          <planeGeometry args={[8, 4]} />
          <meshBasicMaterial map={texture} transparent />
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
  characterId,
  heading = 0,
  balanceSeconds,
  onlineSeconds,
  badge,
  badgeUrl,
}: {
  position: Point3;
  seated?: boolean;
  kneeling?: boolean;
  color?: string;
  movement?: React.RefObject<number>;
  name?: string;
  fullname?: string;
  avatarUrl?: string | null;
  characterId?: string;
  heading?: number;
  balanceSeconds?: number;
  onlineSeconds?: number;
  badge?: string | null;
  badgeUrl?: string | null;
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
    <group position={position} rotation={[0, heading, 0]}>
      <AssetErrorBoundary>
        <Suspense fallback={null}>
          <CharacterModel characterId={characterId} movement={movement} seated={seated} />
        </Suspense>
      </AssetErrorBoundary>
      {!characterId && <group>
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
      </group>}
      {name && <AvatarTag name={name} fullname={fullname} avatarUrl={avatarUrl} balanceSeconds={balanceSeconds} onlineSeconds={onlineSeconds} badge={badge} badgeUrl={badgeUrl} />}
    </group>
  );
}

function CharacterModel({ characterId, movement, seated }: { characterId?: string; movement?: React.RefObject<number>; seated: boolean }) {
  const gltf = useLoader(GLTFLoader, characterUrl(characterId));
  const model = useMemo(() => {
    const copy = cloneSkeleton(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(copy);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    copy.position.set(-center.x, -bounds.min.y, -center.z);
    const scale = size.y > 0 ? 1.75 / size.y : 1;
    return { copy, scale };
  }, [gltf.scene]);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  const activeName = useRef('');
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(model.copy);
    mixerRef.current = mixer;
    return () => { mixer.stopAllAction(); mixerRef.current = null; activeAction.current = null; activeName.current = ''; };
  }, [model.copy]);
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    const running = movement?.current || 0;
    const name = seated ? 'SitDown' : running > 1 ? 'Run' : running > 0 ? 'Walk' : 'Idle';
    if (name !== activeName.current) {
      activeAction.current?.fadeOut(0.18);
      const clip = gltf.animations.find((item) => item.name === name) || gltf.animations[0];
      const action = clip ? mixer.clipAction(clip) : null;
      if (action) {
        action.reset();
        action.setLoop(seated ? THREE.LoopOnce : THREE.LoopRepeat, seated ? 1 : Infinity);
        action.clampWhenFinished = seated;
        action.fadeIn(0.18).play();
      }
      activeAction.current = action;
      activeName.current = name;
    }
    mixer.update(delta);
  });
  return <group scale={model.scale} position={[0, seated ? -0.5 : 0, 0]}><primitive object={model.copy} /></group>;
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
      <mesh position={[0, 3.25, -length / 2]} receiveShadow>
        <boxGeometry args={[width, 6.5, 0.18]} />
        <meshStandardMaterial color="#29243a" />
      </mesh>
      {[-width / 2, width / 2].map((x) => (
        <mesh key={x} position={[x, 3.25, 0]} receiveShadow>
          <boxGeometry args={[0.18, 6.5, length]} />
          <meshStandardMaterial color="#242231" />
        </mesh>
      ))}
      <mesh position={[0, 6.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} /><meshStandardMaterial color="#353247" side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 7 }, (_, row) => -36 + row * 12).flatMap((z) =>
        Array.from({ length: 5 }, (_, column) => -29 + column * 14.5).map((x) => <group key={`${x}:${z}`} position={[x, 6.16, z]}>
          <mesh><boxGeometry args={[4.8, .12, .8]} /><meshStandardMaterial color="#dfd8fb" emissive="#b9e9ec" emissiveIntensity={2} /></mesh>
          <mesh position={[0, -.13, 0]}><boxGeometry args={[4.3, .08, .55]} /><meshBasicMaterial color="#f6f4ff" /></mesh>
        </group>))}
      <mesh position={[0, 4.9, -length / 2 + 0.12]}>
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
  const areaLight = useRef<THREE.PointLight>(null);
  const wallSlots = useMemo(() => props.wallImages.length
    ? Array.from({ length: Math.max(4, props.wallImages.length) }, (_, index) => ({ art: props.wallImages[index % props.wallImages.length], index }))
    : [], [props.wallImages]);
  const avatarGroup = useRef<THREE.Group>(null);
  const avatarPosition = useRef<Point3>([...props.startPosition]);
  const heading = useRef(0);
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
  const cameraLook = useRef(new THREE.Vector3(props.startPosition[0], 1.2, props.startPosition[2] - 2));
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
    if (props.cameraEnabled && !seatedStation && !props.kneeling) {
      const strafe =
        Number(props.heldKeys.current.has('d') || props.heldKeys.current.has('arrowright')) -
        Number(props.heldKeys.current.has('a') || props.heldKeys.current.has('arrowleft'));
      const forward =
        Number(props.heldKeys.current.has('w') || props.heldKeys.current.has('arrowup')) -
        Number(props.heldKeys.current.has('s') || props.heldKeys.current.has('arrowdown'));
      if (strafe || forward) {
        movementAmount.current = props.heldKeys.current.has('shift') ? 1.7 : 1;
        const length = Math.hypot(strafe, forward);
        const yaw = props.orbit.current.yaw;
        const dx = (strafe * Math.cos(yaw) - forward * Math.sin(yaw)) / length;
        const dz = (-strafe * Math.sin(yaw) - forward * Math.cos(yaw)) / length;
        const speed = props.heldKeys.current.has('shift') ? 5 : 3.1;
        const nextX = position[0] + dx * speed * Math.min(delta, 0.05);
        const nextZ = position[2] + dz * speed * Math.min(delta, 0.05);
        const x = canMoveTo(nextX, position[2]) ? nextX : position[0];
        const z = canMoveTo(x, nextZ) && (props.canEnterCafe || nextZ >= entranceZ) ? nextZ : position[2];
        avatarPosition.current = [x, 0, z];
        props.onPositionChange(x, z);
        const desiredHeading = Math.atan2(dx, dz);
        const difference = Math.atan2(Math.sin(desiredHeading - heading.current), Math.cos(desiredHeading - heading.current));
        heading.current += difference * Math.min(1, delta * 8);
        const now = performance.now();
        if (now - lastMoveSend.current > 100) {
          props.onMove(x, z);
          lastMoveSend.current = now;
        }
      }
    }
    const current = avatarPosition.current;
    if (areaLight.current) areaLight.current.position.set(current[0], 5.8, current[2]);
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
      avatarGroup.current.rotation.y = seatedStation
        ? Math.atan2(seatedStation.screenAnchor[0] - seatedStation.seatAnchor[0], seatedStation.screenAnchor[2] - seatedStation.seatAnchor[2])
        : heading.current;
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
      const orbit = props.orbit.current;
      target.current.set(
        current[0] + Math.sin(orbit.yaw) * 5.2,
        3.1 + orbit.pitch * 3,
        current[2] + Math.cos(orbit.yaw) * 5.2,
      );
      cameraTarget.current.set(
        current[0],
        1.25,
        current[2],
      );
    }
    // Keep the camera inside the room, even while it catches up after an orbit turn.
    const cameraWallX = worldBounds.halfWidth + 0.5;
    const cameraWallZ = worldBounds.halfLength + 0.5;
    target.current.x = THREE.MathUtils.clamp(target.current.x, -cameraWallX, cameraWallX);
    target.current.z = THREE.MathUtils.clamp(target.current.z, -cameraWallZ, cameraWallZ);
    target.current.y = THREE.MathUtils.clamp(target.current.y, 0.35, 6.15);
    camera.position.lerp(target.current, Math.min(1, delta * 3.2));
    camera.position.set(
      THREE.MathUtils.clamp(camera.position.x, -cameraWallX, cameraWallX),
      THREE.MathUtils.clamp(camera.position.y, 0.35, 6.15),
      THREE.MathUtils.clamp(camera.position.z, -cameraWallZ, cameraWallZ),
    );
    cameraLook.current.lerp(cameraTarget.current, Math.min(1, delta * 5));
    camera.lookAt(cameraLook.current);
  });

  return (
    <>
      <color attach="background" args={['#191827']} />
      <fog attach="fog" args={['#191827', 25, 48]} />
      <ambientLight intensity={1.3} color="#c7b4ec" />
      <pointLight ref={areaLight} intensity={32} distance={23} color="#f2e9ff" />
      <directionalLight
        position={[4, 9, 6]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <RoomShell />
      <LeaderboardBoard data={props.leaderboard} />
      <Suspense fallback={null}>
        {wallSlots.filter(({ index }) => {
          const corner = index % 4;
          const x = corner < 2 ? -worldBounds.halfWidth : worldBounds.halfWidth;
          const z = (corner % 2 === 0 ? -1 : 1) * (worldBounds.halfLength - 7);
          return Math.hypot(x - visibleCenter[0], z - visibleCenter[2]) < 34;
        }).map(({ art, index }) => <AssetErrorBoundary key={`${art.id}:${index}`}><WallPicture art={art} index={index} total={props.wallTotal} onClick={() => props.onWallArtClick(art)} /></AssetErrorBoundary>)}
      </Suspense>
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
          name={props.localName}
          fullname={props.localFullname}
          avatarUrl={props.localAvatarUrl}
          characterId={props.localCharacterId}
          balanceSeconds={props.localBalanceSeconds}
          onlineSeconds={props.localOnlineSeconds}
          badge={props.localBadge}
          badgeUrl={props.localBadgeUrl}
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
              characterId={player.characterId}
              heading={station ? Math.atan2(station.screenAnchor[0] - station.seatAnchor[0], station.screenAnchor[2] - station.seatAnchor[2]) : player.heading}
              balanceSeconds={player.balanceSeconds}
              onlineSeconds={player.onlineSeconds}
              badge={player.badge}
              badgeUrl={player.badgeUrl}
            />
          );
        })}
    </>
  );
}

export default function NetverseScene(props: Omit<Props, 'wallImages' | 'wallTotal' | 'onWallArtClick' | 'orbit'>) {
  const [wall, setWall] = useState<{ total: number; images: WallArt[] }>({ total: 0, images: [] });
  const [selectedArt, setSelectedArt] = useState<WallArt | null>(null);
  const orbit = useRef({ yaw: 0, pitch: 0 });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const refresh = () => api<{ total: number; images: WallArt[] }>('/api/art/wall').then(setWall).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('netverse:art-updated', refresh);
    return () => { clearInterval(timer); window.removeEventListener('netverse:art-updated', refresh); };
  }, []);
  useEffect(() => {
    if (!selectedArt) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedArt(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedArt]);
  return <div className="netverse-canvas" onPointerDown={(event) => {
      if (!props.cameraEnabled || !(event.target instanceof HTMLCanvasElement)) return;
      pointer.current = { x: event.clientX, y: event.clientY };
    }} onPointerMove={(event) => {
      if (!pointer.current || !event.buttons) return;
      orbit.current.yaw += (event.clientX - pointer.current.x) * .006;
      orbit.current.pitch = Math.max(-.35, Math.min(.8, orbit.current.pitch + (event.clientY - pointer.current.y) * .004));
      pointer.current = { x: event.clientX, y: event.clientY };
    }} onPointerUp={() => { pointer.current = null; }} onPointerLeave={() => { pointer.current = null; }}>
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [props.startPosition[0], 3.1, props.startPosition[2] + 5.2], fov: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <World {...props} wallImages={wall.images} wallTotal={wall.total} onWallArtClick={setSelectedArt} orbit={orbit} />
    </Canvas>
    {selectedArt && <div className="wall-art-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelectedArt(null); }}>
      <section role="dialog" aria-modal="true" aria-label={`Ảnh trên tường máy ${selectedArt.station_id}`}>
        <button type="button" onClick={() => setSelectedArt(null)} aria-label="Đóng ảnh">×</button>
        <Image unoptimized src={selectedArt.image_url} alt={selectedArt.title || `Tranh máy ${selectedArt.station_id}`} width={1200} height={900} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <p>Máy PC #{String(selectedArt.station_id).padStart(3, '0')} · {selectedArt.nickname}</p>
      </section>
    </div>}
  </div>;
}
