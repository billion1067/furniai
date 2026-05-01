import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  Box,
  Camera,
  Download,
  Grid3X3,
  Image,
  Lightbulb,
  Move3D,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import './styles.css';

type CameraCalibration = {
  fov: number;
  pitch: number;
  yaw: number;
  roll: number;
  cameraHeight: number;
  floorDepth: number;
};

type FurnitureAsset = {
  id: string;
  name: string;
  object: Object3D;
};

type ObjectTransform = {
  position: number[];
  rotation: number[];
  scale: number[];
};

const initialCalibration: CameraCalibration = {
  fov: 54,
  pitch: -12,
  yaw: 0,
  roll: 0,
  cameraHeight: 1.55,
  floorDepth: 4.4,
};

const rad = (degrees: number) => (degrees * Math.PI) / 180;

function createFurnitureProxy() {
  const group = new Group();
  group.name = 'Generated chair proxy';

  const wood = new MeshStandardMaterial({ color: '#a86835', roughness: 0.62, metalness: 0.04 });
  const fabric = new MeshStandardMaterial({ color: '#2f7868', roughness: 0.78, metalness: 0.02 });
  const dark = new MeshStandardMaterial({ color: '#222427', roughness: 0.5, metalness: 0.15 });

  const seat = new Mesh(new BoxGeometry(1.15, 0.18, 1.0), fabric);
  seat.position.y = 0.65;
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);

  const back = new Mesh(new BoxGeometry(1.15, 1.1, 0.16), fabric);
  back.position.set(0, 1.14, -0.43);
  back.rotation.x = rad(-8);
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);

  const rail = new Mesh(new BoxGeometry(1.28, 0.08, 0.12), wood);
  rail.position.set(0, 1.74, -0.5);
  rail.castShadow = true;
  group.add(rail);

  const legPositions = [
    [-0.48, 0.31, -0.36],
    [0.48, 0.31, -0.36],
    [-0.48, 0.31, 0.36],
    [0.48, 0.31, 0.36],
  ];
  legPositions.forEach(([x, y, z]) => {
    const leg = new Mesh(new BoxGeometry(0.12, 0.62, 0.12), dark);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  });

  group.position.set(0, 0, -1.4);
  group.scale.setScalar(0.9);
  return group;
}

function makePerspectiveLines(depth = 7, width = 6) {
  const group = new Group();
  const material = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32 });

  for (let i = -3; i <= 3; i += 1) {
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3(i, 0.012, 0),
      new Vector3(i * 0.18, 0.012, -depth),
    ]);
    group.add(new Line(geometry, material));
  }

  for (let z = 0; z >= -depth; z -= 0.7) {
    const taper = Math.max(0.18, 1 + z / depth);
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3((-width * taper) / 2, 0.012, z),
      new Vector3((width * taper) / 2, 0.012, z),
    ]);
    group.add(new Line(geometry, material));
  }

  return group;
}

function useObjectUrl(initialUrl: string | null = null) {
  const [url, setUrl] = useState<string | null>(initialUrl);

  const update = (file: File | null) => {
    setUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const useStatic = (nextUrl: string) => {
    setUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return nextUrl;
    });
  };

  useEffect(() => () => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }, [url]);

  return [url, update, useStatic] as const;
}

function FurniStudio() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const furnitureRef = useRef<Object3D | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const [backgroundUrl, setBackgroundFile, setSampleBackground] = useObjectUrl('/sample-room.svg');
  const [furnitureImagePreview, setFurnitureImagePreview] = useObjectUrl(null);
  const [assetName, setAssetName] = useState('Sample generated chair');
  const [assetSource, setAssetSource] = useState<'sample' | 'glb' | 'image-pending'>('sample');
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [showGrid, setShowGrid] = useState(true);
  const [calibration, setCalibration] = useState(initialCalibration);
  const [isRendering, setIsRendering] = useState(false);
  const [assetTransform, setAssetTransform] = useState<ObjectTransform | null>({
    position: [0, 0, -1.4],
    rotation: [0, 0, 0],
    scale: [0.9, 0.9, 0.9],
  });

  const syncAssetTransform = (object = furnitureRef.current) => {
    if (!object) return;
    setAssetTransform({
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    });
  };

  const sceneContract = useMemo(
    () => ({
      cameraMatrix: {
        fov: calibration.fov,
        pitch: calibration.pitch,
        yaw: calibration.yaw,
        roll: calibration.roll,
        cameraHeightMeters: calibration.cameraHeight,
      },
      roomBox: {
        floorDepthMeters: calibration.floorDepth,
        coordinateSystem: 'threejs-y-up-z-depth',
      },
      asset: {
        name: assetName,
        source: assetSource,
        imageTo3DStatus: assetSource === 'image-pending' ? 'queued-ui-only' : 'not-requested',
        transform: assetTransform,
      },
    }),
    [assetName, assetSource, assetTransform, calibration],
  );

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    const scene = new Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(calibration.fov, mount.clientWidth / mount.clientHeight, 0.01, 80);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const ambient = new AmbientLight(new Color('#f7f0e6'), 1.15);
    scene.add(ambient);

    const sun = new DirectionalLight('#fff3df', 2.15);
    sun.position.set(-2.5, 5.8, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const floor = new Mesh(new PlaneGeometry(12, 12), new ShadowMaterial({ color: '#111111', opacity: 0.26 }));
    floor.name = 'Shadow receiving floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(12, 24, '#ffffff', '#ffffff');
    grid.name = 'Metric floor grid';
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    scene.add(grid);

    const perspectiveLines = makePerspectiveLines();
    perspectiveLines.name = 'Perspective guide';
    scene.add(perspectiveLines);

    const furniture = createFurnitureProxy();
    furnitureRef.current = furniture;
    scene.add(furniture);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.target.set(0, 0.75, -1.8);

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode(mode);
    transform.attach(furniture);
    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
    });
    transform.addEventListener('objectChange', () => syncAssetTransform());
    transformRef.current = transform;
    scene.add(transform.getHelper());
    syncAssetTransform(furniture);

    let frame = 0;
    const resize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };

    window.addEventListener('resize', resize);
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      transform.detach();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    camera.fov = calibration.fov;
    camera.position.set(0, calibration.cameraHeight, calibration.floorDepth);
    camera.rotation.set(rad(calibration.pitch), rad(calibration.yaw), rad(calibration.roll), 'YXZ');
    camera.updateProjectionMatrix();
  }, [calibration]);

  useEffect(() => {
    transformRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.traverse((object) => {
      if (object.name === 'Metric floor grid' || object.name === 'Perspective guide') {
        object.visible = showGrid;
      }
    });
  }, [showGrid]);

  const loadGlb = async (file: File) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    setIsRendering(true);
    try {
      const gltf = await loader.loadAsync(url);
      const asset: FurnitureAsset = {
        id: crypto.randomUUID(),
        name: file.name,
        object: gltf.scene,
      };
      asset.object.name = asset.name;
      asset.object.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      asset.object.position.set(0, 0, -1.4);
      asset.object.scale.setScalar(1);

      if (furnitureRef.current) {
        transformRef.current?.detach();
        sceneRef.current?.remove(furnitureRef.current);
      }
      furnitureRef.current = asset.object;
      sceneRef.current?.add(asset.object);
      transformRef.current?.attach(asset.object);
      syncAssetTransform(asset.object);
      setAssetName(asset.name);
      setAssetSource('glb');
    } finally {
      URL.revokeObjectURL(url);
      setIsRendering(false);
    }
  };

  const useSampleChair = () => {
    const chair = createFurnitureProxy();
    if (furnitureRef.current) {
      transformRef.current?.detach();
      sceneRef.current?.remove(furnitureRef.current);
    }
    furnitureRef.current = chair;
    sceneRef.current?.add(chair);
    transformRef.current?.attach(chair);
    syncAssetTransform(chair);
    setAssetName('Sample generated chair');
    setAssetSource('sample');
  };

  const handleFurnitureImage = (file: File | null) => {
    setFurnitureImagePreview(file);
    if (!file) return;
    setAssetName(`${file.name} · Image-to-3D pending`);
    setAssetSource('image-pending');
  };

  const resetScene = () => {
    setCalibration(initialCalibration);
    if (furnitureRef.current) {
      furnitureRef.current.position.set(0, 0, -1.4);
      furnitureRef.current.rotation.set(0, 0, 0);
      furnitureRef.current.scale.setScalar(0.9);
      syncAssetTransform();
    }
  };

  const exportComposite = () => {
    const data = rendererRef.current?.domElement.toDataURL('image/png');
    if (!data) return;
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = 'furniai-composite.png';
    anchor.click();
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Box size={25} />
          <div>
            <strong>FurniAI</strong>
            <span>Image-to-3D ready UI</span>
          </div>
        </div>

        <section className="panel sample-panel">
          <h2><Sparkles size={17} /> 샘플 체험</h2>
          <div className="sample-actions">
            <button onClick={() => setSampleBackground('/sample-room.svg')}>샘플 공간</button>
            <button onClick={useSampleChair}>샘플 의자 3D</button>
          </div>
          <p>공간 사진과 예시 의자가 기본으로 준비되어 있어 바로 드래그 배치를 테스트할 수 있습니다.</p>
        </section>

        <label className="upload-zone">
          <Image size={19} />
          <span>공간 사진 업로드</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setBackgroundFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <section className="panel image-to-3d">
          <h2><Sparkles size={17} /> 가구 이미지 → 3D</h2>
          <label className="upload-zone inline-upload">
            <Upload size={18} />
            <span>가구 이미지 선택</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => handleFurnitureImage(event.target.files?.[0] ?? null)}
            />
          </label>
          {furnitureImagePreview ? (
            <div className="furniture-preview">
              <img src={furnitureImagePreview} alt="Furniture image preview" />
              <div>
                <strong>변환 대기</strong>
                <span>현재는 UI만 제공하며, 실제 3D 변환은 다음 단계에서 백엔드 파이프라인에 연결합니다.</span>
              </div>
            </div>
          ) : (
            <div className="pipeline-placeholder">
              <span>1. 이미지 업로드</span>
              <span>2. 객체 분리</span>
              <span>3. GLB 생성</span>
            </div>
          )}
        </section>

        <label className="upload-zone">
          <Upload size={19} />
          <span>외부 생성 GLB 업로드</span>
          <input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadGlb(file);
          }} />
        </label>

        <section className="panel">
          <h2><Camera size={17} /> 카메라 매칭</h2>
          <Range label="FOV" value={calibration.fov} min={28} max={88} suffix="deg" onChange={(fov) => setCalibration({ ...calibration, fov })} />
          <Range label="Pitch" value={calibration.pitch} min={-45} max={18} suffix="deg" onChange={(pitch) => setCalibration({ ...calibration, pitch })} />
          <Range label="Yaw" value={calibration.yaw} min={-30} max={30} suffix="deg" onChange={(yaw) => setCalibration({ ...calibration, yaw })} />
          <Range label="Roll" value={calibration.roll} min={-12} max={12} suffix="deg" onChange={(roll) => setCalibration({ ...calibration, roll })} />
          <Range label="Camera H" value={calibration.cameraHeight} min={0.5} max={2.4} step={0.05} suffix="m" onChange={(cameraHeight) => setCalibration({ ...calibration, cameraHeight })} />
        </section>

        <section className="panel">
          <h2><Move3D size={17} /> 가구 조작</h2>
          <div className="segmented">
            <button className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')}>Move</button>
            <button className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')}>Rotate</button>
            <button className={mode === 'scale' ? 'active' : ''} onClick={() => setMode('scale')}>Scale</button>
          </div>
          <label className="switch">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            <Grid3X3 size={16} />
            <span>투시 그리드 표시</span>
          </label>
        </section>

        <section className="panel contract">
          <h2><Lightbulb size={17} /> 엔진 출력</h2>
          <pre>{JSON.stringify(sceneContract, null, 2)}</pre>
        </section>

        <div className="actions">
          <button onClick={resetScene}><RotateCcw size={17} /> Reset</button>
          <button className="primary" onClick={exportComposite}><Download size={17} /> Export</button>
        </div>
      </aside>

      <section className="stage">
        {backgroundUrl ? (
          <img className="room-image" src={backgroundUrl} alt="Room background" />
        ) : (
          <div className="empty-stage">
            <Image size={46} />
            <strong>공간 이미지를 업로드하세요</strong>
            <span>사진 위에 Three.js 카메라, 그리드, 그림자, GLB 에셋이 합성됩니다.</span>
          </div>
        )}
        <div ref={mountRef} className="three-mount" />
        <div className="status-strip">
          <span>{assetName}</span>
          <span>{isRendering ? 'Loading model' : 'Depth buffer + shadow enabled'}</span>
        </div>
      </section>
    </main>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-row">
      <span>{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value.toFixed(step < 1 ? 2 : 0)}{suffix}</output>
    </label>
  );
}

declare global {
  interface HTMLElement {
    furniAiRoot?: Root;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element was not found.');

rootElement.furniAiRoot ??= createRoot(rootElement);
rootElement.furniAiRoot.render(
  <React.StrictMode>
    <FurniStudio />
  </React.StrictMode>,
);
