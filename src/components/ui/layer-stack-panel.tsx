/**
 * PCB Layer Stack Panel
 * Advanced layer management for multi-layer PCB design
 * Supports stackup definition, impedance control, and manufacturing specs
 */

"use client";

import { useState, useCallback, useMemo } from "react";

export interface LayerStackupInfo {
  number: number;
  name: string;
  type: 'signal' | 'power' | 'ground' | 'mixed' | 'dielectric';
  thickness: number; // µm
  material: string;
  dielectricConstant?: number;
  lossTangent?: number;
  copperWeight?: number; // oz/ft²
  roughness?: number; // µm RMS
  impedance?: {
    singleEnded: number; // Ω
    differential: number; // Ω
  };
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface ManufacturingConstraints {
  minTraceWidth: number; // µm
  minSpacing: number; // µm
  minViaSize: number; // µm
  minViaDrill: number; // µm
  aspectRatio: number; // max drill depth / diameter
  copperWeights: number[]; // available copper weights
  dielectrics: string[]; // available dielectric materials
}

interface LayerStackPanelProps {
  layers: LayerStackupInfo[];
  constraints: ManufacturingConstraints;
  boardThickness: number; // µm
  onLayerUpdate: (layers: LayerStackupInfo[]) => void;
  onConstraintsUpdate: (constraints: ManufacturingConstraints) => void;
  onThicknessUpdate: (thickness: number) => void;
}

// Standard PCB materials database
const DIELECTRIC_MATERIALS = {
  'FR4_Standard': {
    name: 'FR4 Standard',
    dielectricConstant: 4.3,
    lossTangent: 0.02,
    color: '#8FBC8F'
  },
  'FR4_HighTG': {
    name: 'FR4 High-TG',
    dielectricConstant: 4.2,
    lossTangent: 0.015,
    color: '#9ACD32'
  },
  'Rogers4350B': {
    name: 'Rogers 4350B',
    dielectricConstant: 3.48,
    lossTangent: 0.0037,
    color: '#DEB887'
  },
  'Polyimide': {
    name: 'Polyimide',
    dielectricConstant: 3.4,
    lossTangent: 0.008,
    color: '#F0E68C'
  },
  'PTFE': {
    name: 'PTFE/Teflon',
    dielectricConstant: 2.1,
    lossTangent: 0.0009,
    color: '#F5F5DC'
  }
};

const COPPER_WEIGHTS = [0.5, 1, 2, 3, 4, 6]; // oz/ft²

export function LayerStackPanel({
  layers,
  constraints,
  boardThickness,
  onLayerUpdate,
  onConstraintsUpdate,
  onThicknessUpdate
}: LayerStackPanelProps) {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [showImpedance, setShowImpedance] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate total thickness
  const calculatedThickness = useMemo(() => {
    return layers.reduce((total, layer) => total + layer.thickness, 0);
  }, [layers]);

  // Impedance calculator (simplified)
  const calculateImpedance = useCallback((layer: LayerStackupInfo, width: number, spacing: number) => {
    if (layer.type !== 'signal') return { singleEnded: 0, differential: 0 };

    // Simplified microstrip impedance calculation
    const Er = layer.dielectricConstant || 4.3;
    const h = layer.thickness;
    const w = width;
    const s = spacing;

    // Single-ended impedance (microstrip)
    const singleEnded = 87 / Math.sqrt(Er + 1.41) * Math.log(5.98 * h / (0.8 * w + w));

    // Differential impedance
    const differential = 2 * singleEnded * (1 - 0.48 * Math.exp(-0.96 * s / h));

    return {
      singleEnded: Math.round(singleEnded),
      differential: Math.round(differential)
    };
  }, []);

  const updateLayer = (layerNumber: number, updates: Partial<LayerStackupInfo>) => {
    const newLayers = layers.map(layer =>
      layer.number === layerNumber ? { ...layer, ...updates } : layer
    );
    onLayerUpdate(newLayers);
  };

  const addLayer = (insertAfter: number) => {
    const newLayerNumber = Math.max(...layers.map(l => l.number)) + 1;
    const newLayer: LayerStackupInfo = {
      number: newLayerNumber,
      name: `Layer_${newLayerNumber}`,
      type: 'signal',
      thickness: 35, // 35µm = 1oz copper
      material: 'FR4_Standard',
      dielectricConstant: 4.3,
      lossTangent: 0.02,
      copperWeight: 1,
      roughness: 1.8,
      visible: true,
      locked: false,
      color: '#8B4513'
    };

    const insertIndex = layers.findIndex(l => l.number === insertAfter) + 1;
    const newLayers = [
      ...layers.slice(0, insertIndex),
      newLayer,
      ...layers.slice(insertIndex)
    ];

    onLayerUpdate(newLayers);
  };

  const removeLayer = (layerNumber: number) => {
    if (layers.length <= 2) return; // Minimum 2 layers
    const newLayers = layers.filter(layer => layer.number !== layerNumber);
    onLayerUpdate(newLayers);
  };

  const moveLayer = (layerNumber: number, direction: 'up' | 'down') => {
    const currentIndex = layers.findIndex(l => l.number === layerNumber);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= layers.length) return;

    const newLayers = [...layers];
    [newLayers[currentIndex], newLayers[newIndex]] = [newLayers[newIndex], newLayers[currentIndex]];
    onLayerUpdate(newLayers);
  };

  return (
    <div className="layer-stack-panel bg-gray-900 text-white p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">PCB Layer Stack</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImpedance(!showImpedance)}
            className={`px-3 py-1 rounded text-xs ${
              showImpedance ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            Impedance
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-1 rounded text-xs ${
              showAdvanced ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Board thickness info */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <div className="flex justify-between text-sm">
          <span>Calculated Thickness:</span>
          <span className="font-mono">{(calculatedThickness / 1000).toFixed(3)} mm</span>
        </div>
        <div className="flex justify-between text-sm text-gray-400">
          <span>Target Thickness:</span>
          <input
            type="number"
            value={boardThickness / 1000}
            onChange={(e) => onThicknessUpdate(Number(e.target.value) * 1000)}
            className="bg-gray-700 text-white px-2 py-1 rounded w-20 text-right"
            step="0.1"
          />
          <span>mm</span>
        </div>
      </div>

      {/* Layer list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {layers.map((layer, index) => (
          <LayerCard
            key={layer.number}
            layer={layer}
            isSelected={selectedLayer === layer.number}
            isTop={index === 0}
            isBottom={index === layers.length - 1}
            showImpedance={showImpedance}
            showAdvanced={showAdvanced}
            onSelect={() => setSelectedLayer(layer.number)}
            onUpdate={(updates) => updateLayer(layer.number, updates)}
            onAddAfter={() => addLayer(layer.number)}
            onRemove={() => removeLayer(layer.number)}
            onMove={(direction) => moveLayer(layer.number, direction)}
            constraints={constraints}
          />
        ))}
      </div>

      {/* Add layer button */}
      <button
        onClick={() => addLayer(layers[layers.length - 1]?.number || 0)}
        className="w-full mt-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
      >
        + Add Layer
      </button>

      {/* Manufacturing constraints */}
      {showAdvanced && (
        <div className="mt-6 p-3 bg-gray-800 rounded">
          <h4 className="font-semibold mb-3">Manufacturing Constraints</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-gray-400">Min Trace (µm)</label>
              <input
                type="number"
                value={constraints.minTraceWidth}
                onChange={(e) => onConstraintsUpdate({
                  ...constraints,
                  minTraceWidth: Number(e.target.value)
                })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full"
              />
            </div>
            <div>
              <label className="block text-gray-400">Min Spacing (µm)</label>
              <input
                type="number"
                value={constraints.minSpacing}
                onChange={(e) => onConstraintsUpdate({
                  ...constraints,
                  minSpacing: Number(e.target.value)
                })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full"
              />
            </div>
            <div>
              <label className="block text-gray-400">Min Via (µm)</label>
              <input
                type="number"
                value={constraints.minViaSize}
                onChange={(e) => onConstraintsUpdate({
                  ...constraints,
                  minViaSize: Number(e.target.value)
                })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full"
              />
            </div>
            <div>
              <label className="block text-gray-400">Aspect Ratio</label>
              <input
                type="number"
                step="0.1"
                value={constraints.aspectRatio}
                onChange={(e) => onConstraintsUpdate({
                  ...constraints,
                  aspectRatio: Number(e.target.value)
                })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual layer card component
interface LayerCardProps {
  layer: LayerStackupInfo;
  isSelected: boolean;
  isTop: boolean;
  isBottom: boolean;
  showImpedance: boolean;
  showAdvanced: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<LayerStackupInfo>) => void;
  onAddAfter: () => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  constraints: ManufacturingConstraints;
}

function LayerCard({
  layer,
  isSelected,
  isTop,
  isBottom,
  showImpedance,
  showAdvanced,
  onSelect,
  onUpdate,
  onAddAfter,
  onRemove,
  onMove,
  constraints
}: LayerCardProps) {
  const material = DIELECTRIC_MATERIALS[layer.material as keyof typeof DIELECTRIC_MATERIALS];

  return (
    <div
      className={`layer-card border rounded-lg p-3 cursor-pointer transition-colors ${
        isSelected ? 'border-blue-500 bg-gray-800' : 'border-gray-600 bg-gray-850'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Layer color indicator */}
          <div
            className="w-4 h-4 rounded border border-gray-500"
            style={{ backgroundColor: layer.color }}
          />

          {/* Visibility toggle */}
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(e) => onUpdate({ visible: e.target.checked })}
            className="form-checkbox h-4 w-4 text-blue-600"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Layer name and type */}
          <div>
            <div className="font-medium text-sm">{layer.name}</div>
            <div className="text-xs text-gray-400 capitalize">{layer.type}</div>
          </div>
        </div>

        {/* Layer controls */}
        <div className="flex items-center space-x-1">
          {!isTop && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove('up'); }}
              className="p-1 hover:bg-gray-700 rounded text-xs"
              title="Move up"
            >
              ↑
            </button>
          )}
          {!isBottom && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove('down'); }}
              className="p-1 hover:bg-gray-700 rounded text-xs"
              title="Move down"
            >
              ↓
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onAddAfter(); }}
            className="p-1 hover:bg-gray-700 rounded text-xs"
            title="Add layer after"
          >
            +
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 hover:bg-red-700 rounded text-xs"
            title="Remove layer"
            disabled={layer.locked}
          >
            ×
          </button>
        </div>
      </div>

      {/* Expanded layer details */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-gray-600 space-y-3">
          {/* Basic properties */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={layer.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={layer.type}
                onChange={(e) => onUpdate({ type: e.target.value as LayerStackupInfo['type'] })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
              >
                <option value="signal">Signal</option>
                <option value="power">Power</option>
                <option value="ground">Ground</option>
                <option value="mixed">Mixed</option>
                <option value="dielectric">Dielectric</option>
              </select>
            </div>
          </div>

          {/* Thickness and material */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Thickness (µm)</label>
              <input
                type="number"
                value={layer.thickness}
                onChange={(e) => onUpdate({ thickness: Number(e.target.value) })}
                className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
              />
            </div>
            {layer.type !== 'dielectric' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Copper Weight (oz)</label>
                <select
                  value={layer.copperWeight || 1}
                  onChange={(e) => onUpdate({ copperWeight: Number(e.target.value) })}
                  className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
                >
                  {COPPER_WEIGHTS.map(weight => (
                    <option key={weight} value={weight}>{weight} oz</option>
                  ))}
                </select>
              </div>
            )}
            {layer.type === 'dielectric' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Material</label>
                <select
                  value={layer.material}
                  onChange={(e) => {
                    const material = DIELECTRIC_MATERIALS[e.target.value as keyof typeof DIELECTRIC_MATERIALS];
                    onUpdate({
                      material: e.target.value,
                      dielectricConstant: material?.dielectricConstant,
                      lossTangent: material?.lossTangent
                    });
                  }}
                  className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
                >
                  {Object.entries(DIELECTRIC_MATERIALS).map(([key, mat]) => (
                    <option key={key} value={key}>{mat.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Electrical properties */}
          {layer.type === 'dielectric' && showAdvanced && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Dielectric Constant</label>
                <input
                  type="number"
                  step="0.1"
                  value={layer.dielectricConstant || 4.3}
                  onChange={(e) => onUpdate({ dielectricConstant: Number(e.target.value) })}
                  className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Loss Tangent</label>
                <input
                  type="number"
                  step="0.001"
                  value={layer.lossTangent || 0.02}
                  onChange={(e) => onUpdate({ lossTangent: Number(e.target.value) })}
                  className="bg-gray-700 text-white px-2 py-1 rounded w-full text-sm"
                />
              </div>
            </div>
          )}

          {/* Impedance info */}
          {showImpedance && layer.type === 'signal' && (
            <div className="p-2 bg-gray-750 rounded">
              <div className="text-xs text-gray-400 mb-1">Impedance (Ω)</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>SE: {layer.impedance?.singleEnded || 50}Ω</div>
                <div>Diff: {layer.impedance?.differential || 100}Ω</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Default layer stack for standard 4-layer board
export const DEFAULT_LAYER_STACK: LayerStackupInfo[] = [
  {
    number: 1,
    name: 'Top Copper',
    type: 'signal',
    thickness: 35,
    material: 'Copper',
    copperWeight: 1,
    roughness: 1.8,
    visible: true,
    locked: false,
    color: '#8B4513'
  },
  {
    number: 2,
    name: 'Prepreg 1',
    type: 'dielectric',
    thickness: 200,
    material: 'FR4_Standard',
    dielectricConstant: 4.3,
    lossTangent: 0.02,
    visible: true,
    locked: false,
    color: '#8FBC8F'
  },
  {
    number: 3,
    name: 'Internal 1',
    type: 'power',
    thickness: 35,
    material: 'Copper',
    copperWeight: 1,
    roughness: 1.8,
    visible: true,
    locked: false,
    color: '#4169E1'
  },
  {
    number: 4,
    name: 'Core',
    type: 'dielectric',
    thickness: 1500,
    material: 'FR4_Standard',
    dielectricConstant: 4.3,
    lossTangent: 0.02,
    visible: true,
    locked: false,
    color: '#8FBC8F'
  },
  {
    number: 5,
    name: 'Internal 2',
    type: 'ground',
    thickness: 35,
    material: 'Copper',
    copperWeight: 1,
    roughness: 1.8,
    visible: true,
    locked: false,
    color: '#228B22'
  },
  {
    number: 6,
    name: 'Prepreg 2',
    type: 'dielectric',
    thickness: 200,
    material: 'FR4_Standard',
    dielectricConstant: 4.3,
    lossTangent: 0.02,
    visible: true,
    locked: false,
    color: '#8FBC8F'
  },
  {
    number: 7,
    name: 'Bottom Copper',
    type: 'signal',
    thickness: 35,
    material: 'Copper',
    copperWeight: 1,
    roughness: 1.8,
    visible: true,
    locked: false,
    color: '#CD853F'
  }
];

export const DEFAULT_CONSTRAINTS: ManufacturingConstraints = {
  minTraceWidth: 100, // 100µm
  minSpacing: 100, // 100µm
  minViaSize: 200, // 200µm
  minViaDrill: 150, // 150µm
  aspectRatio: 12,
  copperWeights: COPPER_WEIGHTS,
  dielectrics: Object.keys(DIELECTRIC_MATERIALS)
};