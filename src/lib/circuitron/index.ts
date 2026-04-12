/**
 * Main Circuitron integration module
 * Exports a unified interface for PCB design generation
 */

export { CircuitronSubprocess, circuitronSubprocess, generatePCB } from './subprocess';
export { CircuitronFileProcessor, circuitronFileProcessor } from './file-processor';
export type {
  DesignValidationSummary,
  DesignValidationLevel,
} from './erc-summary';
export {
  summarizeErcText,
  designValidationFromArtifacts,
  findErcContentInArtifacts,
} from './erc-summary';
export {
  getDefaultCircuitronConfig,
  getCircuitronEnvironment,
  validateCircuitronEnvironment,
  buildCircuitronProcessEnv,
} from "./config";
export type {
  CircuitronRequest,
  CircuitronResponse,
  CircuitronConfig,
  CircuitronProcessInfo,
  CircuitronCallbacks,
  CircuitronProgressEvent,
  CircuitronFileInfo
} from './types';

// Re-export for convenience
export { type ProcessedFile } from './file-processor';