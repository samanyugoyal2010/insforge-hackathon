/** Types for structural / FEA-style overlays in the enhanced CAD viewport. */

export type StructuralAnalysisResult = {
  stress: number;
  deflection: number;
  safetyFactor: number;
  isValid: boolean;
};
