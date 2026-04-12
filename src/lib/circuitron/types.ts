/**
 * TypeScript interfaces for Circuitron integration
 * Defines data structures for communicating with Circuitron CLI subprocess
 */

import type { DesignValidationSummary } from "./erc-summary";

export interface CircuitronRequest {
  /** The PCB design prompt/requirement */
  prompt: string;
  /** Project name for file organization */
  projectName: string;
  /** Optional output directory override */
  outputDir?: string;
  /** Circuitron CLI options */
  options?: {
    /** Keep the generated SKiDL script file */
    keepSkidl?: boolean;
    /** Disable footprint search for more reliable output */
    noFootprintSearch?: boolean;
    /** Enable development/debug mode */
    dev?: boolean;
    /** Custom model selection */
    model?: string;
  };
}

export interface CircuitronResponse {
  /** Whether the PCB generation was successful */
  success: boolean;
  /** Generated output files */
  files: {
    /** SVG schematic file path */
    schematic?: string;
    /** KiCad V5 schematic file path */
    schematicKicad?: string;
    /** KiCad PCB file path */
    pcb?: string;
    /** Netlist file path */
    netlist?: string;
    /** SKiDL script file path (if kept) */
    skidl?: string;
  };
  /**
   * File text keyed by basename, read before temp output cleanup.
   * Used by the agent and UI so paths are not stale after execute() returns.
   */
  fileContentsByBasename?: Record<string, string>;
  /** Normalized map for workspace viewers (schematic.svg, netlist.net, layout.kicad_pcb, …) */
  workspaceFiles?: Record<string, string>;
  /** Where layout/schematic data came from */
  pcbSource?: "circuitron" | "mock" | "pcbflow";
  /** User-visible issues (e.g. Circuitron failed, mock fallback) */
  pcbWarnings?: string[];
  /** Parsed electrical rules (ERC) summary when a .erc artifact exists */
  designValidation?: DesignValidationSummary;
  /** Process logs and output */
  logs: string[];
  /** Error message if failed */
  error?: string;
  /** Cost information */
  cost?: {
    tokens: number;
    estimatedCost: number;
  };
  /** Processing duration */
  duration?: number;
  /** Actual output directory used by Circuitron (may differ from requested) */
  actualOutputDir?: string;
  /** Board outline from last update_pcb args (for fab quoting / cloud snapshot) */
  widthMm?: number;
  heightMm?: number;
  layerCount?: number;
}

export interface CircuitronProcessInfo {
  /** Process ID */
  pid?: number;
  /** Whether process is still running */
  isRunning: boolean;
  /** Start time */
  startTime: Date;
  /** Output directory being used */
  outputDir: string;
}

export interface CircuitronConfig {
  /** Path to Circuitron executable/CLI */
  circuitronPath: string;
  /** Default output directory */
  defaultOutputDir: string;
  /** Default CLI options */
  defaultOptions: CircuitronRequest['options'];
  /** Timeout for subprocess in milliseconds */
  timeout: number;
  /** MCP server URL for Circuitron */
  mcpUrl?: string;
  /** KiCad Docker image */
  kicadImage?: string;
}

export interface CircuitronFileInfo {
  /** File path */
  path: string;
  /** File type/extension */
  type: 'svg' | 'kicad_pcb' | 'sch' | 'netlist' | 'skidl' | 'log' | 'erc';
  /** File size in bytes */
  size: number;
  /** Creation timestamp */
  created: Date;
  /** Whether file is ready for reading */
  ready: boolean;
}

/**
 * Progress event types during Circuitron processing
 */
export type CircuitronProgressEvent =
  | { type: 'started'; message: string }
  | { type: 'planning'; message: string }
  | { type: 'part_finding'; message: string }
  | { type: 'code_generation'; message: string }
  | { type: 'validation'; message: string }
  | { type: 'file_generation'; message: string }
  | { type: 'completed'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string; error: Error };

/**
 * Stream callback types for real-time updates
 */
export interface CircuitronCallbacks {
  onProgress?: (event: CircuitronProgressEvent) => void;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
  onComplete?: (response: CircuitronResponse) => void;
}