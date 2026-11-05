'use client';

import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { characterUrl, characters } from '@/lib/characters';

function PreviewModel({ characterId }: { characterId: string }) {
  const gltf = useLoader(GLTFLoader, characterUrl(characterId));
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    scene.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z));
    return { scene, scale: size.y > 0 ? 1.8 / size.y : 1 };
  }, [gltf.scene]);
  useFrame((state) => {
    if (group.current) group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.65) * 0.35;
  });
  return <group ref={group} position={[0.65, -0.9, 0]} scale={model.scale}><primitive object={model.scene} /></group>;
}

export default function CharacterPreview({ characterId }: { characterId: string }) {
  return <div className="character-preview" role="img" aria-label={`Xem trước nhân vật ${characters.find((item) => item.id === characterId)?.name || ''}`}>
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 3.4], fov: 40 }} gl={{ antialias: true, powerPreference: 'low-power' }}>
      <ambientLight intensity={2} />
      <directionalLight position={[2, 4, 3]} intensity={2.5} />
      <Suspense fallback={null}><PreviewModel characterId={characterId} /></Suspense>
    </Canvas>
    <span>{characters.find((item) => item.id === characterId)?.name}</span>
  </div>;
}
