"use client";

// Suppress THREE.Clock deprecation from @react-three/fiber internals
if (typeof window !== "undefined") {
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("THREE.Clock")) return;
    _warn(...args);
  };
}

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";
import type { Room, Hotspot, Placement } from "@/lib/tour-types";
import { FURNITURE_CATALOG, type FurnitureItem } from "@/lib/furniture-catalog";

// ─── Panorama sphere ──────────────────────────────────────────────────────────

function PanoSphere({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function PanoSphereLoader({ url }: { url: string }) {
  return (
    <Suspense fallback={null}>
      <PanoSphere url={url} />
    </Suspense>
  );
}

// ─── Hotspot ──────────────────────────────────────────────────────────────────

function HotspotMesh({ hotspot, onClick }: { hotspot: Hotspot; onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const r = 480;
  const x = r * Math.sin(hotspot.phi) * Math.cos(hotspot.theta);
  const y = r * Math.cos(hotspot.phi);
  const z = r * Math.sin(hotspot.phi) * Math.sin(hotspot.theta);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.z += delta * 0.8;
  });

  return (
    <group position={[x, y, z]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh
        ref={meshRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        scale={hovered ? 1.3 : 1}
      >
        <torusGeometry args={[8, 2, 8, 32]} />
        <meshBasicMaterial color={hovered ? "#ffffff" : "#60a5fa"} />
      </mesh>
      <mesh>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
    </group>
  );
}

// ─── Floor plane for furniture placement ─────────────────────────────────────

function FloorPlane({ onPlace }: { onPlace: (point: THREE.Vector3) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -50, 0]}
      onClick={(e) => { e.stopPropagation(); onPlace(e.point); }}
    >
      <planeGeometry args={[800, 800]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Placed furniture ─────────────────────────────────────────────────────────

function FurnitureBox({
  placement,
  item,
  selected,
  onSelect,
}: {
  placement: Placement;
  item: FurnitureItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <group
      position={[placement.position_x, placement.position_y, placement.position_z]}
      rotation={[0, placement.rotation_y, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <mesh castShadow>
        <boxGeometry args={item.size} />
        <meshStandardMaterial
          color={item.color}
          roughness={0.7}
          metalness={0.1}
          emissive={selected ? "#334155" : "#000000"}
          emissiveIntensity={selected ? 0.5 : 0}
        />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(item.size[1] / 2) - 0.05, 0]}>
          <ringGeometry args={[
            Math.max(item.size[0], item.size[2]) / 2 + 0.1,
            Math.max(item.size[0], item.size[2]) / 2 + 0.5,
            32,
          ]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

// ─── Camera reset on room change ──────────────────────────────────────────────

function CameraReset({ roomId }: { roomId: string }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 0.001);
    camera.lookAt(0, 0, 1);
  }, [roomId, camera]);
  return null;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  rooms,
  currentRoomId,
  onRoomChange,
  stagingMode,
  pendingModelItem,
  placements,
  selectedPlacementId,
  onPlacementSelect,
  onFloorClick,
}: PanoramaViewerProps) {
  const currentRoom = rooms.find((r) => r.id === currentRoomId);

  return (
    <>
      <CameraReset roomId={currentRoomId} />
      <ambientLight intensity={0.8} />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={-0.5}
        makeDefault
      />

      {currentRoom && <PanoSphereLoader key={currentRoom.id} url={currentRoom.photo_url} />}

      {currentRoom?.hotspots?.map((hs) => {
        const target = rooms.find((r) => r.id === hs.to_room_id);
        if (!target) return null;
        return (
          <HotspotMesh
            key={hs.id}
            hotspot={hs}
            onClick={() => onRoomChange(target.id)}
          />
        );
      })}

      {stagingMode && pendingModelItem && onFloorClick && (
        <FloorPlane onPlace={onFloorClick} />
      )}

      {(placements ?? []).map((p) => {
        const item = FURNITURE_CATALOG.find((f) => f.id === p.model_id);
        if (!item) return null;
        return (
          <FurnitureBox
            key={p.id}
            placement={p}
            item={item}
            selected={selectedPlacementId === p.id}
            onSelect={() => onPlacementSelect?.(p.id)}
          />
        );
      })}
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface PanoramaViewerProps {
  rooms: Room[];
  currentRoomId: string;
  onRoomChange: (id: string) => void;
  stagingMode?: boolean;
  pendingModelItem?: FurnitureItem | null;
  placements?: Placement[];
  selectedPlacementId?: string | null;
  onPlacementSelect?: (id: string | null) => void;
  onFloorClick?: (point: THREE.Vector3) => void;
}

export function PanoramaViewer(props: PanoramaViewerProps) {
  return (
    <Canvas
      camera={{ fov: 75, near: 0.1, far: 1100, position: [0, 0, 0.001] }}
      style={{ background: "#111" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
