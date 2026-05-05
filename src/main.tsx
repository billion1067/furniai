import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
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
  Move3D,
  RotateCcw,
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
  name: string;
  object: Object3D;
};

type AnalysisStatus = 'waiting-image' | 'ready' | 'analyzing' | 'complete';

type ObjectTransform = {
  position: number[];
  rotation: number[];
  scale: number[];
};

type SceneAnalysisResponse = {
  calibration?: Partial<CameraCalibration>;
  depthMapUrl?: string | null;
  error?: string;
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
  const [file, setFile] = useState<File | null>(null);

  const update = (file: File | null) => {
    setFile(file);
    setUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const useStatic = (nextUrl: string) => {
    setFile(null);
    setUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return nextUrl;
    });
  };

  useEffect(() => () => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }, [url]);

  return [url, file, update, useStatic] as const;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    };
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

function FurniStudio() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const furnitureRef = useRef<Object3D | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const [backgroundUrl, backgroundFile, setBackgroundFile] = useObjectUrl(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('waiting-image');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
  const [assetName, setAssetName] = useState('3D 가구 파일을 업로드하세요');
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [showGrid, setShowGrid] = useState(true);
  const [calibration, setCalibration] = useState(initialCalibration);
  const [isRendering, setIsRendering] = useState(false);
  const [assetTransform, setAssetTransform] = useState<ObjectTransform | null>(null);

  const syncAssetTransform = (object = furnitureRef.current) => {
    if (!object) return;
    setAssetTransform({
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    });
  };

  const canPlaceFurniture = Boolean(backgroundUrl && analysisStatus === 'complete' && assetTransform);
  const analysisLabel = useMemo(() => {
    if (!backgroundUrl) return '인테리어 이미지를 업로드하세요';
    if (analysisStatus === 'ready') return '이미지 분석을 실행하세요';
    if (analysisStatus === 'analyzing') return '시점과 깊이를 분석하는 중';
    return depthMapUrl ? '분석 완료 · depth map 수신' : '분석 완료';
  }, [analysisStatus, backgroundUrl, depthMapUrl]);

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

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.target.set(0, 0.75, -1.8);

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode(mode);
    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
    });
    transform.addEventListener('objectChange', () => syncAssetTransform());
    transformRef.current = transform;
    scene.add(transform.getHelper());

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
        object.visible = showGrid && analysisStatus === 'complete';
      }
    });
  }, [analysisStatus, showGrid]);

  useEffect(() => {
    setAnalysisStatus(backgroundUrl ? 'ready' : 'waiting-image');
    setAnalysisMessage('');
    setDepthMapUrl(null);
  }, [backgroundUrl]);

  const analyzeRoomImage = async () => {
    if (!backgroundFile) {
      setAnalysisMessage('먼저 인테리어 이미지 파일을 업로드하세요.');
      return;
    }
    setAnalysisStatus('analyzing');
    setAnalysisMessage('');

    try {
      const image = await fileToDataUrl(backgroundFile);
      const response = await fetch('/api/scene-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const result = (await response.json()) as SceneAnalysisResponse;

      if (!response.ok) {
        throw new Error(result.error ?? 'Replicate 분석에 실패했습니다.');
      }

      setCalibration({
        ...initialCalibration,
        ...result.calibration,
      });
      setDepthMapUrl(result.depthMapUrl ?? null);
      setShowGrid(true);
      setAnalysisStatus('complete');
      setAnalysisMessage(result.depthMapUrl ? 'Replicate가 깊이 이미지를 생성했습니다.' : 'Replicate 분석이 완료됐습니다.');
    } catch (error) {
      setAnalysisStatus('ready');
      setAnalysisMessage(error instanceof Error ? error.message : 'Replicate 분석에 실패했습니다.');
    }
  };

  const loadGlb = async (file: File) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    setIsRendering(true);
    try {
      const gltf = await loader.loadAsync(url);
      const asset: FurnitureAsset = {
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
    } finally {
      URL.revokeObjectURL(url);
      setIsRendering(false);
    }
  };

  const resetScene = () => {
    setCalibration(initialCalibration);
    if (furnitureRef.current) {
      furnitureRef.current.position.set(0, 0, -1.4);
      furnitureRef.current.rotation.set(0, 0, 0);
      furnitureRef.current.scale.setScalar(1);
      syncAssetTransform();
    }
  };

  const exportComposite = () => {
    const rendererCanvas = rendererRef.current?.domElement;
    const roomImage = backgroundImageRef.current;
    if (!rendererCanvas || !roomImage) return;

    const canvas = document.createElement('canvas');
    canvas.width = rendererCanvas.width;
    canvas.height = rendererCanvas.height;
    const context = canvas.getContext('2d');
    if (!context) return;

    const imageRatio = roomImage.naturalWidth / roomImage.naturalHeight;
    const canvasRatio = canvas.width / canvas.height;
    const drawWidth = imageRatio > canvasRatio ? canvas.width : canvas.height * imageRatio;
    const drawHeight = imageRatio > canvasRatio ? canvas.width / imageRatio : canvas.height;
    const drawX = (canvas.width - drawWidth) / 2;
    const drawY = (canvas.height - drawHeight) / 2;

    context.fillStyle = '#0f1110';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(roomImage, drawX, drawY, drawWidth, drawHeight);
    context.drawImage(rendererCanvas, 0, 0, canvas.width, canvas.height);

    const data = canvas.toDataURL('image/png');
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
            <strong>FurniAI Studio</strong>
            <span>Interior image + 3D furniture placement</span>
          </div>
        </div>

        <label className="upload-zone">
          <Image size={19} />
          <span>1. 인테리어 이미지 업로드</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setBackgroundFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <section className="panel analysis-panel">
          <h2><Camera size={17} /> 2. 시점과 깊이 분석</h2>
          <div className={`analysis-state ${analysisStatus}`}>
            <span>{analysisLabel}</span>
          </div>
          <button className="primary full-width" disabled={!backgroundUrl || analysisStatus === 'analyzing'} onClick={analyzeRoomImage}>
            <Camera size={17} />
            Analyze image
          </button>
          {analysisMessage ? <p className="analysis-message">{analysisMessage}</p> : null}
          {depthMapUrl ? (
            <a className="depth-link" href={depthMapUrl} target="_blank" rel="noreferrer">
              Depth map 보기
            </a>
          ) : null}
        </section>

        <label className="upload-zone">
          <Upload size={19} />
          <span>3. 3D 가구 파일 업로드</span>
          <input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadGlb(file);
          }} />
        </label>

        <section className="panel">
          <h2><Camera size={17} /> 분석값 보정</h2>
          <Range label="FOV" value={calibration.fov} min={28} max={88} suffix="deg" onChange={(fov) => setCalibration({ ...calibration, fov })} />
          <Range label="Pitch" value={calibration.pitch} min={-45} max={18} suffix="deg" onChange={(pitch) => setCalibration({ ...calibration, pitch })} />
          <Range label="Yaw" value={calibration.yaw} min={-30} max={30} suffix="deg" onChange={(yaw) => setCalibration({ ...calibration, yaw })} />
          <Range label="Roll" value={calibration.roll} min={-12} max={12} suffix="deg" onChange={(roll) => setCalibration({ ...calibration, roll })} />
          <Range label="Camera H" value={calibration.cameraHeight} min={0.5} max={2.4} step={0.05} suffix="m" onChange={(cameraHeight) => setCalibration({ ...calibration, cameraHeight })} />
        </section>

        <section className="panel">
          <h2><Move3D size={17} /> 4. 자유 배치</h2>
          <div className="segmented">
            <button disabled={!assetTransform} className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')}>Move</button>
            <button disabled={!assetTransform} className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')}>Rotate</button>
            <button disabled={!assetTransform} className={mode === 'scale' ? 'active' : ''} onClick={() => setMode('scale')}>Scale</button>
          </div>
          <label className="switch">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            <Grid3X3 size={16} />
            <span>깊이 가이드 표시</span>
          </label>
        </section>

        <div className="actions">
          <button onClick={resetScene}><RotateCcw size={17} /> Reset</button>
          <button className="primary" disabled={!canPlaceFurniture} onClick={exportComposite}><Download size={17} /> Export</button>
        </div>
      </aside>

      <section className="stage">
        {backgroundUrl ? (
          <img ref={backgroundImageRef} className="room-image" src={backgroundUrl} alt="Room background" />
        ) : (
          <div className="empty-stage">
            <Image size={46} />
            <strong>인테리어 이미지를 업로드하세요</strong>
            <span>AI 분석 후 3D 가구 모델을 올려 시점과 깊이에 맞게 배치합니다.</span>
          </div>
        )}
        <div ref={mountRef} className="three-mount" />
        <div className="status-strip">
          <span>{assetName}</span>
          <span>{isRendering ? 'Loading model' : analysisLabel}</span>
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
