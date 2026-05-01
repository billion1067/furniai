'use client';

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import type { Placement } from '@/lib/types';

type SofaSceneProps = {
  width: number;
  height: number;
  placement: Placement;
  modelUrl: string;
};

function SofaModel({ placement, modelUrl }: { placement: Placement; modelUrl: string }) {
  const gltf = useGLTF(modelUrl);
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [gltf.scene]);

  // Three.js units are mapped loosely to screen pixels by the orthographic camera.
  // Uniform scaling only: the model must never be stretched on a single axis.
  return (
    <group
      position={[placement.x, -placement.y, 0]}
      rotation={[0, THREE.MathUtils.degToRad(placement.rotationY), THREE.MathUtils.degToRad(placement.rotationZ)]}
      scale={[placement.scale, placement.scale, placement.scale]}
    >
      <primitive object={scene} />
    </group>
  );
}

function ShadowPlane({ placement }: { placement: Placement }) {
  return (
    <mesh position={[placement.x, -placement.y - 12, -4]} rotation={[0, 0, 0]}>
      <circleGeometry args={[80 * placement.scale, 64]} />
      <meshBasicMaterial color="black" transparent opacity={placement.shadowOpacity} depthWrite={false} />
    </mesh>
  );
}

export function SofaScene({ width, height, placement, modelUrl }: SofaSceneProps) {
  return (
    <Canvas
      id="sofa-three-canvas"
      shadows
      gl={{ alpha: true, preserveDrawingBuffer: true }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      orthographic
      camera={{ position: [0, 0, 1000], zoom: 1, left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2, near: 0.1, far: 2000 }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[300, 500, 500]} intensity={1.2} castShadow />
      <Suspense fallback={null}>
        <ShadowPlane placement={{ ...placement, x: placement.x - width / 2, y: placement.y - height / 2 }} />
        <SofaModel placement={{ ...placement, x: placement.x - width / 2, y: placement.y - height / 2 }} modelUrl={modelUrl} />
      </Suspense>
      <OrbitControls enabled={false} />
    </Canvas>
  );
}
