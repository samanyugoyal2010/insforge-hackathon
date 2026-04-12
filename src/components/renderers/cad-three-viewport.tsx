"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  documentToSyntheticShell,
  type CadDocument,
  type CadFeature,
} from "@/lib/cad-document";
import { evaluateCadCsg } from "@/lib/cad-csg-evaluate";
import { featureToBufferGeometry } from "@/lib/cad-geometry-three";
import { useOpenscadStl } from "@/hooks/use-openscad-stl";
import type { ArPcbScene } from "@/lib/ar-pcb";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const MM = 0.001;
const PCB_THICKNESS_M = 1.6 * MM;
/** Prevents coplanar z-fighting between board, silk, parts, and shell at grazing angles. */
const SURFACE_EPS_M = 8e-5;

/**
 * When CSG/OpenSCAD mesh is unavailable, draw each primitive.
 * Subtract volumes stay visible (semi-transparent) so a failed boolean still reads as a cavity.
 */
function CadFallbackFeatures({ document }: { document: CadDocument }) {
  const clipPlanes = useMemo(() => {
    const pres = document.presentation;
    if (!pres || pres.openFace === "none") return null;
    const shell = documentToSyntheticShell(document);
    const reveal = Math.min(0.92, Math.max(0.08, pres.openFaceReveal ?? 0.52));
    if (pres.openFace === "front") {
      const D = shell.lengthMm * MM;
      const zCut = D * (0.5 - reveal);
      return [new THREE.Plane(new THREE.Vector3(0, 0, -1), zCut)];
    }
    const H = shell.heightMm * MM;
    const yCut = H * (0.5 - reveal);
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), yCut)];
  }, [document]);

  return (
    <group>
      {document.features.map((f, i) => (
        <FeaturePrimitiveMesh
          key={`${f.label ?? "f"}-${i}`}
          feature={f}
          clipPlanes={clipPlanes}
        />
      ))}
    </group>
  );
}

function FeaturePrimitiveMesh({
  feature: f,
  clipPlanes,
}: {
  feature: CadFeature;
  clipPlanes?: THREE.Plane[] | null;
}) {
  const geom = useMemo(() => featureToBufferGeometry(f), [f]);
  useEffect(
    () => () => {
      geom.dispose();
    },
    [geom],
  );
  const isCut = f.op === "subtract";
  const clip =
    !isCut && clipPlanes?.length
      ? clipPlanes
      : undefined;
  return (
    <mesh
      position={[f.positionMm.x * MM, f.positionMm.y * MM, f.positionMm.z * MM]}
      rotation={
        f.rotationDeg
          ? [
              THREE.MathUtils.degToRad(f.rotationDeg.x),
              THREE.MathUtils.degToRad(f.rotationDeg.y),
              THREE.MathUtils.degToRad(f.rotationDeg.z),
            ]
          : [0, 0, 0]
      }
      geometry={geom}
      castShadow={!isCut}
    >
      <meshStandardMaterial
        color={isCut ? "#ff6b4a" : "#5a6a7d"}
        metalness={isCut ? 0.2 : 0.45}
        roughness={isCut ? 0.55 : 0.36}
        transparent={isCut}
        opacity={isCut ? 0.28 : 1}
        depthWrite={!isCut}
        clippingPlanes={clip}
        clipShadows={Boolean(clip?.length)}
        polygonOffset={Boolean(isCut)}
        polygonOffsetFactor={isCut ? 1 : 0}
        polygonOffsetUnits={isCut ? 1 : 0}
      />
    </mesh>
  );
}

function CutWireMesh({ f }: { f: CadFeature }) {
  const geom = useMemo(() => featureToBufferGeometry(f), [f]);
  useEffect(
    () => () => {
      geom.dispose();
    },
    [geom],
  );
  return (
    <mesh
      position={[f.positionMm.x * MM, f.positionMm.y * MM, f.positionMm.z * MM]}
      rotation={
        f.rotationDeg
          ? [
              THREE.MathUtils.degToRad(f.rotationDeg.x),
              THREE.MathUtils.degToRad(f.rotationDeg.y),
              THREE.MathUtils.degToRad(f.rotationDeg.z),
            ]
          : [0, 0, 0]
      }
      geometry={geom}
    >
      <meshBasicMaterial
        color="#ff8a70"
        wireframe
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  );
}

function SubtractGhostOverlays({ document }: { document: CadDocument }) {
  const cuts = document.features.filter((f) => f.op === "subtract");
  if (!cuts.length) return null;
  return (
    <group>
      {cuts.map((f, i) => (
        <CutWireMesh key={`${f.label ?? "c"}-${i}`} f={f} />
      ))}
    </group>
  );
}

/** Avoid a one-frame flash of red subtract wireframes before the solid reads. */
function DelayedSubtractGhostOverlays({
  document,
  active,
}: {
  document: CadDocument;
  active: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    const t = window.setTimeout(() => setReady(true), 180);
    return () => clearTimeout(t);
  }, [active, document]);
  if (!active || !ready) return null;
  return <SubtractGhostOverlays document={document} />;
}

function usePreRenderedStl(base64: string | null | undefined): THREE.BufferGeometry | null {
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    if (!base64) {
      setGeom((prev) => { prev?.dispose(); return null; });
      return;
    }
    try {
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const loader = new STLLoader();
      const g = loader.parse(binary.buffer);
      g.computeVertexNormals();
      g.center();
      g.scale(0.001, 0.001, 0.001);
      setGeom((prev) => { prev?.dispose(); return g; });
    } catch {
      setGeom((prev) => { prev?.dispose(); return null; });
    }
  }, [base64]);
  useEffect(() => () => { geom?.dispose(); }, [geom]);
  return geom;
}

function CadAssemblyRoot({
  document,
  showInner,
  openscadCode,
  preRenderedStlBase64,
  onOpenscadPreviewIssue,
}: {
  document: CadDocument;
  showInner: boolean;
  openscadCode?: string | null;
  preRenderedStlBase64?: string | null;
  onOpenscadPreviewIssue?: (message: string | null) => void;
}) {
  const { geometry: stlGeometry, error: stlError } = useOpenscadStl(openscadCode);
  const preRenderedGeom = usePreRenderedStl(preRenderedStlBase64);

  useEffect(() => {
    if (!onOpenscadPreviewIssue) return;
    const trimmed = openscadCode?.trim();
    if (!trimmed) {
      onOpenscadPreviewIssue(null);
      return;
    }
    if (stlError) {
      const usingCsg = document.features.length > 0;
      onOpenscadPreviewIssue(
        usingCsg
          ? null
          : `OpenSCAD preview failed: ${stlError.slice(0, 160)}`,
      );
      return;
    }
    onOpenscadPreviewIssue(null);
  }, [
    openscadCode,
    stlError,
    document.features.length,
    onOpenscadPreviewIssue,
  ]);

  const nonOscCsg = useMemo(() => {
    if (openscadCode?.trim()) return null;
    return evaluateCadCsg(document);
  }, [document, openscadCode]);

  useEffect(() => {
    return () => {
      nonOscCsg?.dispose();
    };
  }, [nonOscCsg]);

  const [openscadFailCsg, setOpenscadFailCsg] =
    useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!openscadCode?.trim()) {
      setOpenscadFailCsg((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    if (!stlError || document.features.length === 0) {
      if (!stlError) {
        setOpenscadFailCsg((prev) => {
          prev?.dispose();
          return null;
        });
      }
      return;
    }
    const g = evaluateCadCsg(document);
    setOpenscadFailCsg((prev) => {
      prev?.dispose();
      return g;
    });
  }, [stlError, openscadCode, document]);

  if (openscadCode?.trim() && stlGeometry) {
    return (
      <group>
        <mesh geometry={stlGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            color="#6a7a8e"
            metalness={0.35}
            roughness={0.4}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={2}
          />
          <Edges color="#a8bddc" threshold={10} />
        </mesh>
      </group>
    );
  }

  const mergedFromFeatures =
    nonOscCsg ??
    (openscadCode?.trim() && openscadFailCsg ? openscadFailCsg : null) ??
    (openscadCode?.trim() && stlError && preRenderedGeom ? preRenderedGeom : null);

  return (
    <group>
      {!mergedFromFeatures ? (
        <CadFallbackFeatures document={document} />
      ) : (
        <mesh geometry={mergedFromFeatures} castShadow receiveShadow>
          <meshStandardMaterial
            color="#5a6a7d"
            metalness={0.48}
            roughness={0.34}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={2}
          />
          <Edges color="#a8bddc" threshold={10} />
        </mesh>
      )}
      <DelayedSubtractGhostOverlays
        document={document}
        active={Boolean(showInner && mergedFromFeatures)}
      />
    </group>
  );
}

function CameraController({
  resetTrigger,
  cameraDistanceM,
}: {
  resetTrigger: number;
  cameraDistanceM: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isResetting = useRef(false);
  const resetStart = useRef(0);
  const initialPosition = useRef(new THREE.Vector3());
  const initialTarget = useRef(new THREE.Vector3());
  const targetPosition = useMemo(() => {
    const d = cameraDistanceM;
    return new THREE.Vector3(d * 0.72, d * 0.58, d * 0.72);
  }, [cameraDistanceM]);
  const targetTarget = new THREE.Vector3(0, 0, 0);

  useEffect(() => {
    if (resetTrigger > 0) {
      isResetting.current = true;
      resetStart.current = Date.now();
      initialPosition.current.copy(camera.position);
      initialTarget.current.copy(controlsRef.current?.target || new THREE.Vector3());
    }
  }, [resetTrigger, camera]);

  useFrame(() => {
    if (!isResetting.current || !controlsRef.current) return;

    const elapsed = Date.now() - resetStart.current;
    const duration = 800;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    camera.position.lerpVectors(initialPosition.current, targetPosition, eased);

    const currentTarget = new THREE.Vector3().lerpVectors(
      initialTarget.current,
      targetTarget,
      eased,
    );
    controlsRef.current.target.copy(currentTarget);
    controlsRef.current.update();

    if (t >= 1) {
      isResetting.current = false;
    }
  });

  const minD = Math.max(0.028, cameraDistanceM * 0.14);
  const maxD = Math.max(0.85, cameraDistanceM * 6.5);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      enableZoom
      minDistance={minD}
      maxDistance={maxD}
      makeDefault
    />
  );
}

/** Magic-window AR: fixed offset from origin, rotation follows device attitude. */
function DeviceOrientationCameraRig({
  cameraDistanceM,
}: {
  cameraDistanceM: number;
}) {
  const { camera } = useThree();
  const targetPos = useMemo(() => {
    const d = cameraDistanceM;
    return new THREE.Vector3(d * 0.72, d * 0.58, d * 0.72);
  }, [cameraDistanceM]);

  useLayoutEffect(() => {
    camera.position.copy(targetPos);
  }, [camera, targetPos]);

  useEffect(() => {
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const qScreen = new THREE.Quaternion();
    const qOrient = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const alpha = THREE.MathUtils.degToRad(e.alpha);
      const beta = THREE.MathUtils.degToRad(e.beta);
      const gamma = THREE.MathUtils.degToRad(e.gamma);
      const angle =
        typeof window.screen?.orientation?.angle === "number"
          ? THREE.MathUtils.degToRad(window.screen.orientation.angle)
          : 0;
      euler.set(beta, alpha, -gamma);
      qOrient.setFromEuler(euler);
      qScreen.setFromAxisAngle(zAxis, -angle);
      camera.quaternion.copy(qScreen).multiply(qOrient);
    };

    window.addEventListener("deviceorientation", onOrient, true);
    return () => window.removeEventListener("deviceorientation", onOrient, true);
  }, [camera]);

  return null;
}

export interface CadThreeViewportRef {
  resetCamera: () => void;
}

/** Keep default camera distance/grid in proportion to the shell envelope (mm → scene meters). */
function ViewportCameraSync({
  position,
}: {
  position: readonly [number, number, number];
}) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.updateProjectionMatrix();
  }, [camera, position]);
  return null;
}

export const CadThreeViewport = forwardRef<
  CadThreeViewportRef,
  {
    cad: CadDocument;
    showInner: boolean;
    pcb?: ArPcbScene | null;
    highlightRef?: string | null;
    onPickRef?: (ref: string) => void;
    /** Extra pad/copper-style detail on 3D parts (AR / tutor). */
    pcbBoardDetailed?: boolean;
    /** Transparent canvas over camera feed; omit grid / solid background. */
    variant?: "default" | "arPassthrough";
    /** When variant is arPassthrough, rotate the view with device attitude (after iOS permission). */
    useDeviceOrientation?: boolean;
    /** OpenSCAD WASM compile error in the browser (CSG may be shown as fallback). */
    onOpenscadPreviewIssue?: (message: string | null) => void;
    /** Server-pre-rendered STL (base64) for mobile that can't run WASM. */
    preRenderedStlBase64?: string | null;
  }
>(
  (
    {
      cad,
      showInner,
      pcb = null,
      highlightRef = null,
      onPickRef,
      pcbBoardDetailed = true,
      variant = "default",
      useDeviceOrientation = false,
      onOpenscadPreviewIssue,
      preRenderedStlBase64,
    },
    ref,
  ) => {
  const openscadCode = cad.openscad?.code;
  const [resetTick, setResetTick] = useState(0);

  const viewScale = useMemo(() => {
    const s = documentToSyntheticShell(cad);
    const maxMm = Math.max(12, s.widthMm, s.heightMm, s.lengthMm);
    const maxM = maxMm * MM;
    const camDist = Math.max(0.22, maxM * 2.05);
    const gridExtent = Math.min(1.85, Math.max(0.44, maxM * 2.4));
    return {
      camDist,
      camPos: [camDist * 0.72, camDist * 0.58, camDist * 0.72] as const,
      gridExtent,
      cellSize: Math.max(0.0045, Math.min(0.034, maxM / 15)),
      sectionSize: Math.max(0.028, Math.min(0.11, maxM / 3.8)),
      fadeDistance: Math.min(2.4, Math.max(0.6, maxM * 3.4)),
    };
  }, [cad]);

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => {
        setResetTick((t) => t + 1);
      },
    }),
    [],
  );

  const passthrough = variant === "arPassthrough";

  return (
    <Canvas
      dpr={[1, 2]}
      shadows={!passthrough}
      camera={{ position: [0.22, 0.18, 0.22], fov: passthrough ? 48 : 38 }}
      className="h-full w-full"
      gl={{
        antialias: true,
        localClippingEnabled: true,
        alpha: passthrough,
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl, scene }) => {
        if (passthrough) {
          scene.background = null;
          gl.setClearColor(0x000000, 0);
        }
      }}
    >
      <ViewportCameraSync position={viewScale.camPos} />
      {passthrough ? null : <color attach="background" args={["#070709"]} />}
      <ambientLight intensity={passthrough ? 0.72 : 0.55} />
      <directionalLight
        position={[2.5, 3.5, 2]}
        intensity={passthrough ? 1.05 : 1.35}
        castShadow={!passthrough}
        shadow-mapSize={passthrough ? [512, 512] : [1024, 1024]}
      />
      <directionalLight position={[-2, 1.5, -1]} intensity={passthrough ? 0.45 : 0.38} />
      <hemisphereLight
        intensity={passthrough ? 0.5 : 0.35}
        groundColor="#1a1a22"
        color="#b8c4d8"
      />
      {passthrough ? null : (
        <Grid
          args={[viewScale.gridExtent, viewScale.gridExtent]}
          cellSize={viewScale.cellSize}
          cellThickness={0.6}
          sectionSize={viewScale.sectionSize}
          sectionThickness={1}
          fadeDistance={viewScale.fadeDistance}
          fadeStrength={1}
          position={[0, -0.05, 0]}
        />
      )}
      <CadAssemblyRoot
        document={cad}
        showInner={showInner}
        openscadCode={openscadCode}
        preRenderedStlBase64={preRenderedStlBase64}
        onOpenscadPreviewIssue={onOpenscadPreviewIssue}
      />
      {pcb ? (
        <PcbAssembly
          pcb={pcb}
          cad={cad}
          highlightRef={highlightRef}
          onPickRef={onPickRef}
          boardDetailed={pcbBoardDetailed}
        />
      ) : null}
      {passthrough && useDeviceOrientation ? (
        <DeviceOrientationCameraRig cameraDistanceM={viewScale.camDist} />
      ) : (
        <CameraController
          resetTrigger={resetTick}
          cameraDistanceM={viewScale.camDist}
        />
      )}
    </Canvas>
  );
});

CadThreeViewport.displayName = "CadThreeViewport";

function footprintBoxMm(footprint: string): { w: number; h: number; t: number } {
  const f = footprint.toLowerCase();
  if (f.includes("conn") || f.includes("usb") || f.includes("header")) return { w: 9, h: 7, t: 4 };
  if (f.includes("ic") || f.includes("qfn") || f.includes("qfp")) return { w: 7, h: 7, t: 1.4 };
  if (f.includes("sw")) return { w: 6, h: 6, t: 2.2 };
  if (f.includes("led") || f.includes("diode")) return { w: 3.2, h: 1.6, t: 1.2 };
  if (f.includes("1206")) return { w: 3.2, h: 1.6, t: 1.0 };
  if (f.includes("0805")) return { w: 2.0, h: 1.25, t: 0.9 };
  if (f.includes("0603")) return { w: 1.6, h: 0.8, t: 0.8 };
  return { w: 4.5, h: 3.2, t: 1.2 };
}

function PcbAssembly({
  pcb,
  cad,
  highlightRef,
  onPickRef,
  boardDetailed = true,
}: {
  pcb: ArPcbScene;
  cad: CadDocument;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  boardDetailed?: boolean;
}) {
  const shell = useMemo(() => documentToSyntheticShell(cad), [cad]);

  // Place board centered in shell; lift slightly off the floor.
  const boardW = pcb.widthMm * MM;
  const boardH = pcb.heightMm * MM;
  const shellW = shell.widthMm * MM;
  const shellH = shell.heightMm * MM;
  const shellL = shell.lengthMm * MM;
  const lift = 2.2 * MM + SURFACE_EPS_M * 6;

  const scale = Math.min(
    0.92 * (shellW / Math.max(boardW, 1e-4)),
    0.92 * (shellL / Math.max(boardH, 1e-4)),
    1,
  );

  return (
    <group
      position={[0, -shellH / 2 + PCB_THICKNESS_M / 2 + lift, 0]}
      rotation={[0, 0, 0]}
      scale={[scale, 1, scale]}
    >
      <mesh receiveShadow castShadow={false}>
        <boxGeometry args={[boardW, PCB_THICKNESS_M, boardH]} />
        <meshStandardMaterial
          color="#155e37"
          metalness={0.15}
          roughness={0.78}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        position={[0, PCB_THICKNESS_M / 2 + SURFACE_EPS_M, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[boardW * 0.98, boardH * 0.98]} />
        <meshStandardMaterial
          color="#0b1a12"
          emissive="#0a2a18"
          emissiveIntensity={boardDetailed ? 0.42 : 0.35}
          transparent
          opacity={boardDetailed ? 0.62 : 0.55}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {boardDetailed ? (
        <mesh
          position={[0, PCB_THICKNESS_M / 2 + SURFACE_EPS_M * 3, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[boardW * 0.92, boardH * 0.92]} />
          <meshStandardMaterial
            color="#0d2818"
            metalness={0.08}
            roughness={0.92}
            transparent
            opacity={0.22}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      ) : null}

      {pcb.components.map((c) => {
        const x = (c.xMm - pcb.widthMm / 2) * MM;
        const z = (c.yMm - pcb.heightMm / 2) * MM;
        const dims = footprintBoxMm(c.footprint);
        const w = dims.w * MM;
        const d = dims.h * MM;
        const t = dims.t * MM;
        const isHot = Boolean(highlightRef && c.ref === highlightRef);
        const pending = Boolean(c.assemblyPending);
        const yCenter = PCB_THICKNESS_M / 2 + t / 2 + SURFACE_EPS_M * 2;
        const bodyColor = pending
          ? "#252b38"
          : isHot
            ? "#93c5fd"
            : "#1c2430";
        const bodyOpacity = pending ? 0.38 : 1;
        return (
          <group key={c.ref} position={[x, yCenter, z]}>
            <mesh
              castShadow={!pending}
              onClick={(e) => {
                e.stopPropagation();
                onPickRef?.(c.ref);
              }}
            >
              <boxGeometry args={[w, t, d]} />
              <meshStandardMaterial
                color={bodyColor}
                emissive={isHot ? "#60a5fa" : "#000000"}
                emissiveIntensity={isHot ? 0.75 : 0}
                metalness={isHot ? 0.45 : pending ? 0.12 : 0.25}
                roughness={isHot ? 0.25 : 0.55}
                transparent={pending || bodyOpacity < 1}
                opacity={bodyOpacity}
                depthWrite={!pending}
              />
            </mesh>
            {boardDetailed ? (
              <mesh position={[0, t / 2 + 0.00012, 0]}>
                <boxGeometry args={[w * 0.88, 0.0002, d * 0.88]} />
                <meshStandardMaterial
                  color="#c9a227"
                  metalness={0.55}
                  roughness={0.38}
                  transparent={pending}
                  opacity={pending ? 0.25 : 0.92}
                  depthWrite={false}
                />
              </mesh>
            ) : null}
            {isHot ? <HighlightHalo /> : null}
          </group>
        );
      })}
    </group>
  );
}

function HighlightHalo() {
  const r = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = r.current;
    if (!m) return;
    const t = clock.getElapsedTime();
    m.position.y = 0.008 + Math.sin(t * 2.2) * 0.0015;
    m.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2.2) * 0.12;
  });
  return (
    <mesh ref={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
      <ringGeometry args={[0.006, 0.012, 48]} />
      <meshBasicMaterial color="#60a5fa" transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}

/** Shared CAD + PCB for WebXR / alternate canvases (same units as CadThreeViewport). */
export function CadArWorkspaceContent({
  cad,
  showInner,
  pcb,
  highlightRef,
  onPickRef,
  pcbBoardDetailed = true,
  preRenderedStlBase64,
}: {
  cad: CadDocument;
  showInner: boolean;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  pcbBoardDetailed?: boolean;
  preRenderedStlBase64?: string | null;
}) {
  const openscadCode = cad.openscad?.code;
  return (
    <>
      <CadAssemblyRoot
        document={cad}
        showInner={showInner}
        openscadCode={openscadCode}
        preRenderedStlBase64={preRenderedStlBase64}
      />
      {pcb ? (
        <PcbAssembly
          pcb={pcb}
          cad={cad}
          highlightRef={highlightRef}
          onPickRef={onPickRef}
          boardDetailed={pcbBoardDetailed}
        />
      ) : null}
    </>
  );
}

/** Lighting tuned for passthrough / AR (no heavy shadows). */
export function CadArWorkspaceLights({ forWebXr = false }: { forWebXr?: boolean }) {
  return (
    <>
      <ambientLight intensity={forWebXr ? 0.95 : 0.55} />
      <directionalLight
        position={[2.5, 3.5, 2]}
        intensity={forWebXr ? 1.05 : 1.35}
        castShadow={!forWebXr}
        shadow-mapSize={forWebXr ? [512, 512] : [1024, 1024]}
      />
      <directionalLight position={[-2, 1.5, -1]} intensity={forWebXr ? 0.5 : 0.38} />
      <hemisphereLight
        intensity={forWebXr ? 0.55 : 0.35}
        groundColor="#1a1a22"
        color="#d8e4f8"
      />
    </>
  );
}
