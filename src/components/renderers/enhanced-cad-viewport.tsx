/**
 * Enhanced CAD Three.js Viewport with Stress Visualization
 * Extends the existing Three.js renderer with physics-based visualization
 * Supports stress distribution, thermal analysis, and material properties
 */

"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ShellParams } from "@/lib/cad-shell";
import type { CadPrimitive } from "@/lib/geometry/cad-primitives";
import { ParametricBox, LBracket, Cylinder } from "@/lib/geometry/cad-primitives";
import type { StructuralAnalysisResult } from "@/lib/agent/enhanced-tools";

export interface StressPoint {
  position: [number, number, number];
  stress: number;
  safetyFactor: number;
  displacement: [number, number, number];
}

export interface ThermalPoint {
  position: [number, number, number];
  temperature: number;
  heatFlux: number;
}

export interface MaterialVisualization {
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
}

interface EnhancedCadViewportProps {
  shell: ShellParams;
  primitives?: CadPrimitive[];
  stressData?: StressPoint[];
  thermalData?: ThermalPoint[];
  analysisResult?: StructuralAnalysisResult;
  showStress?: boolean;
  showThermal?: boolean;
  showDeformation?: boolean;
  showMaterial?: boolean;
  materialType?: string;
  showInner?: boolean;
  width?: number;
  height?: number;
}

// Material definitions with proper visual properties
const MATERIAL_DEFINITIONS: Record<string, MaterialVisualization> = {
  'S235_steel': {
    name: 'S235 Steel',
    color: '#8C9AAF',
    metalness: 0.8,
    roughness: 0.2,
    opacity: 1.0
  },
  'Al6061': {
    name: 'Aluminum 6061',
    color: '#B8C5D1',
    metalness: 0.9,
    roughness: 0.1,
    opacity: 1.0
  },
  'S355_steel': {
    name: 'S355 Steel',
    color: '#7A8499',
    metalness: 0.8,
    roughness: 0.15,
    opacity: 1.0
  },
  'Ti6Al4V': {
    name: 'Titanium',
    color: '#A8B2C2',
    metalness: 0.7,
    roughness: 0.3,
    opacity: 1.0
  },
  'PLA': {
    name: 'PLA Plastic',
    color: '#E8F4FD',
    metalness: 0.0,
    roughness: 0.8,
    opacity: 0.9
  }
};

// Enhanced shell mesh with stress visualization
function EnhancedShellMesh({
  shell,
  stressData = [],
  showStress = false,
  showDeformation = false,
  materialType = 'S235_steel',
  showInner = true
}: {
  shell: ShellParams;
  stressData?: StressPoint[];
  showStress: boolean;
  showDeformation: boolean;
  materialType: string;
  showInner: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = 0.001;
  const material = MATERIAL_DEFINITIONS[materialType] || MATERIAL_DEFINITIONS['S235_steel'];

  // Create base geometries
  const outer = useMemo(
    () =>
      new THREE.BoxGeometry(
        shell.widthMm * scale,
        shell.heightMm * scale,
        shell.lengthMm * scale,
      ),
    [shell.heightMm, shell.lengthMm, shell.widthMm],
  );

  const inner = useMemo(
    () =>
      new THREE.BoxGeometry(
        Math.max(1, shell.widthMm - shell.wallMm * 2) * scale,
        Math.max(1, shell.heightMm - shell.wallMm * 2) * scale,
        Math.max(1, shell.lengthMm - shell.wallMm * 2) * scale,
      ),
    [shell.heightMm, shell.lengthMm, shell.wallMm, shell.widthMm],
  );

  // Apply deformation if enabled
  useEffect(() => {
    if (showDeformation && stressData.length > 0 && meshRef.current) {
      const geometry = meshRef.current.geometry as THREE.BoxGeometry;
      const positionAttribute = geometry.getAttribute('position');

      // Apply displacement based on stress data
      for (let i = 0; i < positionAttribute.count; i++) {
        // Find nearest stress point
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        let nearestStress = stressData[0];
        let minDistance = Infinity;

        for (const stress of stressData) {
          const distance = vertex.distanceTo(new THREE.Vector3(...stress.position));
          if (distance < minDistance) {
            minDistance = distance;
            nearestStress = stress;
          }
        }

        // Apply displacement (exaggerated for visibility)
        const displacementScale = 0.001;
        vertex.add(new THREE.Vector3(...nearestStress.displacement).multiplyScalar(displacementScale));
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }

      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }, [showDeformation, stressData]);

  // Create stress color mapping
  const stressTexture = useMemo(() => {
    if (!showStress || stressData.length === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;

    // Create stress gradient
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, '#00ff00'); // Low stress - green
    gradient.addColorStop(0.5, '#ffff00'); // Medium stress - yellow
    gradient.addColorStop(0.8, '#ff8000'); // High stress - orange
    gradient.addColorStop(1, '#ff0000'); // Critical stress - red

    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);

    return new THREE.CanvasTexture(canvas);
  }, [showStress, stressData]);

  return (
    <group>
      <mesh ref={meshRef} geometry={outer}>
        <meshStandardMaterial
          color={material.color}
          metalness={material.metalness}
          roughness={material.roughness}
          opacity={material.opacity}
          transparent={material.opacity < 1}
          map={stressTexture}
        />
      </mesh>
      {showInner && (
        <mesh geometry={inner}>
          <meshStandardMaterial
            color={material.color}
            transparent
            opacity={0.15}
            metalness={material.metalness * 0.5}
            roughness={material.roughness + 0.2}
          />
        </mesh>
      )}
    </group>
  );
}

// Primitive renderer for complex CAD objects
function PrimitiveRenderer({
  primitive,
  materialType = 'S235_steel',
  showStress = false,
  stressData = []
}: {
  primitive: CadPrimitive;
  materialType: string;
  showStress: boolean;
  stressData: StressPoint[];
}) {
  const material = MATERIAL_DEFINITIONS[materialType] || MATERIAL_DEFINITIONS['S235_steel'];
  const scale = 0.001;

  if (primitive instanceof ParametricBox) {
    return (
      <mesh
        position={[
          primitive.position.x * scale,
          primitive.position.y * scale,
          primitive.position.z * scale
        ]}
      >
        <boxGeometry
          args={[
            primitive.length * scale,
            primitive.width * scale,
            primitive.height * scale
          ]}
        />
        <meshStandardMaterial
          color={material.color}
          metalness={material.metalness}
          roughness={material.roughness}
          opacity={material.opacity}
          transparent={material.opacity < 1}
        />
      </mesh>
    );
  } else if (primitive instanceof LBracket) {
    return (
      <group
        position={[
          primitive.position.x * scale,
          primitive.position.y * scale,
          primitive.position.z * scale
        ]}
      >
        {/* Horizontal arm */}
        <mesh position={[primitive.armLength * scale / 2, 0, primitive.thickness * scale / 2]}>
          <boxGeometry
            args={[
              primitive.armLength * scale,
              primitive.armWidth * scale,
              primitive.thickness * scale
            ]}
          />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
          />
        </mesh>

        {/* Vertical flange */}
        <mesh position={[primitive.thickness * scale / 2, 0, primitive.flangeHeight * scale / 2]}>
          <boxGeometry
            args={[
              primitive.thickness * scale,
              primitive.armWidth * scale,
              primitive.flangeHeight * scale
            ]}
          />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
          />
        </mesh>

        {/* Gusset (if present) */}
        {primitive.hasGusset && (
          <mesh
            position={[
              primitive.armLength * scale / 4,
              0,
              primitive.flangeHeight * scale / 4
            ]}
            rotation={[0, 0, Math.PI / 4]}
          >
            <boxGeometry
              args={[
                primitive.gussetThickness * scale,
                primitive.armWidth * scale,
                Math.sqrt(2) * primitive.armLength * scale / 4
              ]}
            />
            <meshStandardMaterial
              color={material.color}
              metalness={material.metalness}
              roughness={material.roughness}
              opacity={0.8}
              transparent
            />
          </mesh>
        )}
      </group>
    );
  } else if (primitive instanceof Cylinder) {
    return (
      <mesh
        position={[
          primitive.position.x * scale,
          primitive.position.y * scale,
          primitive.position.z * scale + primitive.height * scale / 2
        ]}
      >
        <cylinderGeometry
          args={[
            primitive.radius * scale,
            primitive.radius * scale,
            primitive.height * scale,
            32
          ]}
        />
        <meshStandardMaterial
          color={material.color}
          metalness={material.metalness}
          roughness={material.roughness}
        />
      </mesh>
    );
  }

  return null;
}

// Stress visualization particles
function StressVisualization({ stressData }: { stressData: StressPoint[] }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(stressData.length * 3);
    const colors = new Float32Array(stressData.length * 3);
    const scale = 0.001;

    stressData.forEach((point, i) => {
      // Position
      positions[i * 3] = point.position[0] * scale;
      positions[i * 3 + 1] = point.position[1] * scale;
      positions[i * 3 + 2] = point.position[2] * scale;

      // Color based on stress level
      const stressNormalized = Math.min(point.stress / 250e6, 1); // Normalize to 250 MPa
      if (stressNormalized < 0.5) {
        // Green to yellow
        colors[i * 3] = stressNormalized * 2; // Red
        colors[i * 3 + 1] = 1; // Green
        colors[i * 3 + 2] = 0; // Blue
      } else {
        // Yellow to red
        colors[i * 3] = 1; // Red
        colors[i * 3 + 1] = 2 - stressNormalized * 2; // Green
        colors[i * 3 + 2] = 0; // Blue
      }
    });

    return { positions, colors };
  }, [stressData]);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={2} vertexColors sizeAttenuation={false} />
    </points>
  );
}

// Thermal visualization
function ThermalVisualization({ thermalData }: { thermalData: ThermalPoint[] }) {
  return (
    <>
      {thermalData.map((point, index) => {
        const scale = 0.001;
        const tempNormalized = Math.min((point.temperature - 25) / 75, 1); // 25-100°C range
        const color = new THREE.Color().setHSL((1 - tempNormalized) * 0.7, 1, 0.5);

        return (
          <mesh
            key={index}
            position={[
              point.position[0] * scale,
              point.position[1] * scale,
              point.position[2] * scale
            ]}
          >
            <sphereGeometry args={[1 + tempNormalized * 3, 16, 16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}
    </>
  );
}

// Analysis results overlay
function AnalysisOverlay({ analysisResult }: { analysisResult: StructuralAnalysisResult }) {
  return (
    <Html position={[0.05, 0.08, 0]} transform occlude>
      <div className="bg-black bg-opacity-75 text-white p-3 rounded-lg text-sm">
        <div className="font-bold mb-2">Structural Analysis</div>
        <div>Max Stress: {analysisResult.stress.toFixed(1)} MPa</div>
        <div>Max Deflection: {analysisResult.deflection.toFixed(3)} mm</div>
        <div className={`font-semibold ${analysisResult.safetyFactor >= 2 ? 'text-green-400' : 'text-red-400'}`}>
          Safety Factor: {analysisResult.safetyFactor.toFixed(2)}
        </div>
        <div className={`text-sm mt-1 ${analysisResult.isValid ? 'text-green-400' : 'text-red-400'}`}>
          Status: {analysisResult.isValid ? 'SAFE' : 'REQUIRES REVIEW'}
        </div>
      </div>
    </Html>
  );
}

// Enhanced lighting setup
function EnhancedLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-10, -10, -5]} intensity={0.5} />
      <hemisphereLight args={['#ffffff', '#60666C']} intensity={0.3} />
    </>
  );
}

// Main component
export const EnhancedCadViewport = forwardRef<
  OrbitControlsImpl,
  EnhancedCadViewportProps
>((props, ref) => {
  const {
    shell,
    primitives = [],
    stressData = [],
    thermalData = [],
    analysisResult,
    showStress = false,
    showThermal = false,
    showDeformation = false,
    showMaterial = true,
    materialType = 'S235_steel',
    showInner = true,
    width = 800,
    height = 600
  } = props;

  return (
    <div style={{ width, height }}>
      <Canvas camera={{ position: [0.15, 0.1, 0.15], fov: 50 }}>
        <EnhancedLighting />

        <OrbitControls ref={ref} makeDefault />

        <Grid
          args={[200, 200]}
          cellColor="white"
          sectionColor="white"
          fadeDistance={400}
          fadeStrength={1}
          infiniteGrid
        />

        <EnhancedShellMesh
          shell={shell}
          stressData={stressData}
          showStress={showStress}
          showDeformation={showDeformation}
          materialType={materialType}
          showInner={showInner}
        />

        {primitives.map((primitive, index) => (
          <PrimitiveRenderer
            key={index}
            primitive={primitive}
            materialType={materialType}
            showStress={showStress}
            stressData={stressData}
          />
        ))}

        {showStress && stressData.length > 0 && (
          <StressVisualization stressData={stressData} />
        )}

        {showThermal && thermalData.length > 0 && (
          <ThermalVisualization thermalData={thermalData} />
        )}

        {analysisResult && (
          <AnalysisOverlay analysisResult={analysisResult} />
        )}

        {/* Material indicator */}
        {showMaterial && (
          <Html position={[-0.08, -0.06, 0]} transform>
            <div className="bg-black bg-opacity-75 text-white p-2 rounded text-xs">
              <div className="font-semibold">{MATERIAL_DEFINITIONS[materialType]?.name || materialType}</div>
            </div>
          </Html>
        )}
      </Canvas>

      {/* Legend */}
      {(showStress || showThermal) && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white p-3 rounded-lg text-xs">
          {showStress && (
            <div className="mb-2">
              <div className="font-semibold mb-1">Stress (MPa)</div>
              <div className="flex items-center">
                <div className="w-4 h-2 bg-green-500 mr-1"></div>
                <span className="mr-2">0-100</span>
                <div className="w-4 h-2 bg-yellow-500 mr-1"></div>
                <span className="mr-2">100-200</span>
                <div className="w-4 h-2 bg-red-500 mr-1"></div>
                <span>200+</span>
              </div>
            </div>
          )}
          {showThermal && (
            <div>
              <div className="font-semibold mb-1">Temperature (°C)</div>
              <div className="flex items-center">
                <div className="w-4 h-2 bg-blue-500 mr-1"></div>
                <span className="mr-2">25-50</span>
                <div className="w-4 h-2 bg-yellow-500 mr-1"></div>
                <span className="mr-2">50-75</span>
                <div className="w-4 h-2 bg-red-500 mr-1"></div>
                <span>75+</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

EnhancedCadViewport.displayName = 'EnhancedCadViewport';