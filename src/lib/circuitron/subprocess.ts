/**
 * Circuitron CLI subprocess wrapper
 * Handles communication with Circuitron Python CLI via Node.js subprocess
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  CircuitronRequest,
  CircuitronResponse,
  CircuitronConfig,
  CircuitronProcessInfo,
  CircuitronCallbacks,
  CircuitronProgressEvent,
  CircuitronFileInfo
} from './types';
import {
  getDefaultCircuitronConfig,
  validateCircuitronEnvironment,
  probeCircuitronMcpServer,
  buildCircuitronProcessEnv,
} from './config';
import { designValidationFromArtifacts } from './erc-summary';

/**
 * Rich/Circuitron box-drawing lines can break naive regexes on chunked stdout
 * (e.g. capturing "│" as the path). Parse the accumulated log for a real directory.
 */
function extractCircuitronSavedOutputDir(fullStdout: string): string | null {
  const key = 'Generated files will be saved to:';
  const i = fullStdout.lastIndexOf(key);
  if (i < 0) return null;
  const tail = fullStdout.slice(i + key.length, i + key.length + 12000);
  for (const line of tail.split(/\r?\n/)) {
    const boxed = line.match(/^\s*[│┃]\s*(\/\S.*?)\s*[│┃]\s*$/);
    if (boxed?.[1]) {
      const p = boxed[1].trim();
      if (p.length >= 2 && !/^[\s│┃]+$/.test(p)) return p;
    }
    const plain = line.match(/^\s*(\/\S{2,})\s*$/);
    if (plain?.[1] && !/[│┃]/.test(plain[1])) return plain[1].trim();
    const rel = line.match(/^\s*(\.\/\S{2,})\s*$/);
    if (rel?.[1]) return rel[1].trim();
  }
  return null;
}

export class CircuitronSubprocess {
  private config: CircuitronConfig;
  private activeProcesses: Map<string, { process: ChildProcess; info: CircuitronProcessInfo }> = new Map();

  constructor(config: Partial<CircuitronConfig> = {}) {
    const defaultConfig = getDefaultCircuitronConfig();
    this.config = {
      ...defaultConfig,
      ...config,
      defaultOptions: {
        ...defaultConfig.defaultOptions,
        ...config.defaultOptions
      }
    };
  }

  /**
   * Detect if a circuit is simple enough for fast-path processing
   */
  private isSimpleCircuit(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();

    // Simple circuit keywords (LED, resistor, buzzer, basic components)
    const simpleKeywords = [
      'led', 'resistor', 'buzzer', 'button', 'switch', 'diode',
      'light up', 'blink', 'simple circuit', 'basic circuit'
    ];

    // Complex circuit keywords (processors, power supplies, communication)
    const complexKeywords = [
      'usb-c', 'microcontroller', 'esp32', 'arduino', 'regulator', 'ldo',
      'switching', 'buck', 'boost', 'communication', 'uart', 'i2c', 'spi',
      'multiple voltages', 'power supply', 'amplifier', 'adc', 'dac'
    ];

    // If it contains complex keywords, it's not simple
    const hasComplexKeywords = complexKeywords.some(keyword => lowerPrompt.includes(keyword));
    if (hasComplexKeywords) {
      return false;
    }

    // If it contains simple keywords and is under 100 words, consider it simple
    const hasSimpleKeywords = simpleKeywords.some(keyword => lowerPrompt.includes(keyword));
    const wordCount = prompt.trim().split(/\s+/).length;

    return hasSimpleKeywords && wordCount < 100;
  }

  /**
   * Execute a Circuitron PCB design request
   */
  async execute(request: CircuitronRequest, callbacks?: CircuitronCallbacks): Promise<CircuitronResponse> {
    const requestId = this.generateRequestId();
    const outputDir = await this.setupOutputDirectory(request.outputDir || requestId);

    try {
      // Build command arguments
      const args = this.buildCommandArgs(request, outputDir);

      // Start subprocess
      const processInfo = await this.startProcess(requestId, args, outputDir);

      // Monitor process and collect output
      const response = await this.monitorProcess(requestId, processInfo, callbacks);

      // Use actual output directory if Circuitron reported one, otherwise use our original
      const finalOutputDir = response.actualOutputDir || outputDir;
      await this.processOutputFiles(response, finalOutputDir);
      let gathered = await this.gatherArtifactsFromDirectory(finalOutputDir);

      // If no files found in primary directory, check Circuitron's default output directories
      if (Object.keys(gathered).length === 0) {
        const fallbackPaths = [
          path.join(process.cwd(), 'circuitron_output'),
          path.join(process.cwd(), 'circuitron-integration', 'circuitron_output'),
          path.join(process.cwd(), 'circuitron-integration', 'circuitron-integration', 'circuitron_output')
        ];

        for (const fallbackPath of fallbackPaths) {
          if (existsSync(fallbackPath)) {
            console.log('Checking fallback directory:', fallbackPath);
            const defaultGathered = await this.gatherArtifactsFromDirectory(fallbackPath);
            if (Object.keys(defaultGathered).length > 0) {
              gathered = defaultGathered;
              console.log('Found files in fallback directory:', fallbackPath, Object.keys(defaultGathered));
              break;
            }
          }
        }
      }

      if (Object.keys(gathered).length > 0) {
        response.fileContentsByBasename = gathered;
        const dv = designValidationFromArtifacts(gathered);
        if (dv) {
          response.designValidation = dv;
        }
      }
      if (response.success && Object.keys(gathered).length === 0) {
        response.success = false;
        const tail = response.logs.join("\n").slice(-1500);
        response.error =
          "Circuitron finished without any .svg / .net / .kicad_pcb / .kicad_sch / .sch files in the output folder. " +
          "Check MCP_URL, Docker (KiCad image), OPENAI_API_KEY, and CIRCUITRON_TIMEOUT_MS. " +
          (tail.trim() ? `\n— Log tail —\n${tail}` : "");
      }

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage));

      return {
        success: false,
        files: {},
        logs: [],
        error: errorMessage
      };
    } finally {
      // Cleanup
      this.activeProcesses.delete(requestId);
      // Note: Don't cleanup temp files here - let the caller handle it after file processing
    }
  }

  /**
   * Check if Circuitron is properly configured and available
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Check environment variables
      const envValidation = validateCircuitronEnvironment();
      if (!envValidation.valid) {
        return {
          healthy: false,
          error: `Missing required environment variables: ${envValidation.missing.join(', ')}`
        };
      }

      if (process.env.CIRCUITRON_SKIP_MCP_CHECK !== "1") {
        const mcp = await probeCircuitronMcpServer();
        if (!mcp.ok) {
          return { healthy: false, error: mcp.error };
        }
      }

      // Try to run circuitron --help
      const args = ['--help'];
      const { success, logs, error } = await this.runCommand(args, { timeout: 10000 });

      if (!success) {
        return { healthy: false, error: error || 'Failed to execute Circuitron CLI' };
      }

      return { healthy: true };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown health check error'
      };
    }
  }

  /**
   * Get information about all active processes
   */
  getActiveProcesses(): CircuitronProcessInfo[] {
    return Array.from(this.activeProcesses.values()).map(({ info }) => info);
  }

  /**
   * Kill an active process by request ID
   */
  async killProcess(requestId: string): Promise<boolean> {
    const processEntry = this.activeProcesses.get(requestId);
    if (!processEntry) {
      return false;
    }

    try {
      processEntry.process.kill('SIGTERM');

      // Wait a bit for graceful shutdown, then force kill if needed
      await new Promise(resolve => setTimeout(resolve, 5000));

      if (processEntry.info.isRunning) {
        processEntry.process.kill('SIGKILL');
      }

      this.activeProcesses.delete(requestId);
      return true;

    } catch (error) {
      console.error('Error killing process:', error);
      return false;
    }
  }

  private generateRequestId(): string {
    return `circuitron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async setupOutputDirectory(outputDir: string): Promise<string> {
    const fullPath = path.resolve(outputDir);
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  private buildCommandArgs(request: CircuitronRequest, outputDir: string): string[] {
    const args: string[] = [];

    // Add options
    const options = { ...this.config.defaultOptions, ...request.options };

    // Force dev mode for better logging and to avoid interactive prompts
    args.push('--dev');

    // Use fast-path for simple circuits to improve performance
    // IMPORTANT: Check the ORIGINAL prompt before any context is added
    const originalPrompt = this.extractOriginalPrompt(request.prompt);
    const isSimple = this.isSimpleCircuit(originalPrompt);
    console.log(`🔍 Circuit detection: original="${originalPrompt}" -> ${isSimple ? 'SIMPLE' : 'COMPLEX'}`);
    console.log(`🔍 Full prompt length: ${request.prompt.length} characters`);

    if (isSimple) {
      args.push('--skip-planning'); // Skip complex planning for simple circuits
      console.log('🚀 Using fast-path mode for simple circuit');
    } else {
      console.log('🐌 Using full pipeline for complex circuit');
    }

    if (options.noFootprintSearch) {
      args.push('--no-footprint-search');
    }

    if (options.keepSkidl) {
      args.push('--keep-skidl');
    }

    // Add output directory
    args.push('--output-dir', outputDir);

    // Add prompt (as final argument)
    args.push(request.prompt);

    console.log(`🛠️ Command args: ${args.join(' ')}`);
    return args;
  }

  /**
   * Extract the original prompt from a potentially context-enhanced prompt
   */
  private extractOriginalPrompt(prompt: string): string {
    // If the prompt has "Context: ... Request: ..." format, extract just the request part
    const requestMatch = prompt.match(/Request:\s*([\s\S]+)$/);
    if (requestMatch) {
      return requestMatch[1].trim();
    }
    // Otherwise return the full prompt
    return prompt;
  }

  private pythonExecutable(): string {
    const p = process.env.PYTHON?.trim();
    if (p) return p;
    return process.platform === "win32" ? "python" : "python3";
  }

  /**
   * CIRCUITRON_BIN = full path to CLI, else python -m circuitron from ./circuitron-integration, else PATH `circuitron`.
   */
  private resolveCircuitronSpawn(cliArgs: string[]): {
    command: string;
    args: string[];
    cwd?: string;
  } {
    const bin = process.env.CIRCUITRON_BIN?.trim();
    if (bin) {
      return { command: bin, args: cliArgs };
    }
    const root = path.join(process.cwd(), "circuitron-integration");
    if (existsSync(path.join(root, "pyproject.toml"))) {
      return {
        command: this.pythonExecutable(),
        args: ["-m", "circuitron", ...cliArgs],
        cwd: root,
      };
    }
    return { command: "circuitron", args: cliArgs };
  }

  private spawnCircuitron(cliArgs: string[]): ChildProcess {
    const spec = this.resolveCircuitronSpawn(cliArgs);
    return spawn(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildCircuitronProcessEnv(),
      cwd: spec.cwd,
    });
  }

  private async startProcess(requestId: string, args: string[], outputDir: string): Promise<CircuitronProcessInfo> {
    const childProcess = this.spawnCircuitron(args);

    const processInfo: CircuitronProcessInfo = {
      pid: childProcess.pid,
      isRunning: true,
      startTime: new Date(),
      outputDir
    };

    this.activeProcesses.set(requestId, { process: childProcess, info: processInfo });

    // Handle automatic responses to interactive prompts
    this.setupAutomaticResponses(childProcess);

    return processInfo;
  }

  private setupAutomaticResponses(childProcess: ChildProcess) {
    if (!childProcess.stdin || !childProcess.stdout) return;

    // Buffer to accumulate stdout data
    let outputBuffer = '';
    let promptsSent = 0;
    const maxPrompts = 10; // Reduce from 20 to prevent excessive loops
    let lastPromptTime = Date.now();

    const handlePrompt = (data: Buffer) => {
      outputBuffer += data.toString();

      // Prevent sending too many responses or responses too frequently
      if (promptsSent >= maxPrompts || (Date.now() - lastPromptTime) < 1000) return;

      // Look for common prompts and respond automatically
      if (outputBuffer.includes('Answer:') && outputBuffer.includes('press Ctrl+C to exit')) {
        childProcess.stdin?.write('\n'); // Send empty answer
        promptsSent++;
        lastPromptTime = Date.now();
        outputBuffer = outputBuffer.slice(-500); // Keep recent output
      } else if (outputBuffer.includes('Edit #') && outputBuffer.includes('press Ctrl+C to exit')) {
        childProcess.stdin?.write('\n'); // Send empty edit
        promptsSent++;
        lastPromptTime = Date.now();
        outputBuffer = outputBuffer.slice(-500);
      } else if (outputBuffer.includes('Additional requirement #') && outputBuffer.includes('press Ctrl+C to exit')) {
        childProcess.stdin?.write('\n'); // Send empty requirement
        promptsSent++;
        lastPromptTime = Date.now();
        outputBuffer = outputBuffer.slice(-500);
      } else if (outputBuffer.includes('└─ ❯') || outputBuffer.includes('┌─')) {
        childProcess.stdin?.write('\n'); // Send enter for any generic prompt
        promptsSent++;
        lastPromptTime = Date.now();
        outputBuffer = outputBuffer.slice(-500);
      } else if (outputBuffer.includes('What would you like me to design?')) {
        // This shouldn't happen since we pass the prompt, but just in case
        childProcess.stdin?.write('LED circuit\n');
        promptsSent++;
        lastPromptTime = Date.now();
        outputBuffer = outputBuffer.slice(-500);
      } else if (outputBuffer.includes('Running in non-interactive mode')) {
        // Don't send automatic responses when in non-interactive mode
        return;
      }

      // Clear old data from buffer to prevent it growing too large
      if (outputBuffer.length > 3000) {
        outputBuffer = outputBuffer.slice(-1000);
      }
    };

    // Set up the prompt handler
    childProcess.stdout.on('data', handlePrompt);

    // Reduce frequency of periodic responses to prevent overwhelming the process
    const intervalId = setInterval(() => {
      if (promptsSent < maxPrompts && childProcess.stdin && !childProcess.killed &&
          (Date.now() - lastPromptTime) > 3000) { // Only send if no recent activity
        childProcess.stdin.write('\n');
        promptsSent++;
        lastPromptTime = Date.now();
      } else if (promptsSent >= maxPrompts) {
        clearInterval(intervalId); // Stop sending responses when limit reached
      }
    }, 5000); // Reduce frequency from 2s to 5s

    // Clean up interval when process ends
    childProcess.on('exit', () => {
      clearInterval(intervalId);
    });
  }

  private async monitorProcess(
    requestId: string,
    processInfo: CircuitronProcessInfo,
    callbacks?: CircuitronCallbacks
  ): Promise<CircuitronResponse> {
    const processEntry = this.activeProcesses.get(requestId);
    if (!processEntry) {
      throw new Error('Process not found');
    }

    const { process: childProcess } = processEntry;
    const logs: string[] = [];
    let stdout = '';
    let stderr = '';
    let actualOutputDir: string | null = null;

    // Setup data handlers
    childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      logs.push(text);

      // Extract actual output directory from full accumulated log (chunk-safe, strips box chars)
      if (!actualOutputDir) {
        const extracted = extractCircuitronSavedOutputDir(stdout);
        if (extracted && extracted.length >= 2 && !/^[\s│┃|]+$/.test(extracted)) {
          try {
            const resolved = path.resolve(extracted);
            if (existsSync(resolved)) {
              actualOutputDir = resolved;
            }
          } catch {
            /* ignore */
          }
        }
      }

      // Parse progress events
      const progressEvent = this.parseProgressFromOutput(text);
      if (progressEvent) {
        callbacks?.onProgress?.(progressEvent);
      }

      callbacks?.onLog?.(text);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logs.push(`[ERROR] ${text}`);
      callbacks?.onLog?.(text);
    });

    // Wait for process completion
    return new Promise((resolve, reject) => {
      // Main timeout
      const mainTimeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        const timeoutMinutes = Math.round(this.config.timeout / 60000);
        reject(new Error(`Circuitron process timed out after ${timeoutMinutes} minutes. Complex PCB designs with multiple components (ESP32, USB-C, etc.) can take up to 15 minutes. Consider simplifying the design or increasing CIRCUITRON_TIMEOUT_MS.`));
      }, this.config.timeout);

      // Progress warnings at intervals
      const halfwayTime = this.config.timeout * 0.5;
      const threeQuarterTime = this.config.timeout * 0.75;

      const halfwayWarning = setTimeout(() => {
        const elapsed = Math.round(halfwayTime / 60000);
        const remaining = Math.round((this.config.timeout - halfwayTime) / 60000);
        callbacks?.onProgress?.({
          type: 'warning',
          message: `Still processing... ${elapsed} minutes elapsed, ${remaining} minutes remaining`
        });
      }, halfwayTime);

      const threeQuarterWarning = setTimeout(() => {
        const elapsed = Math.round(threeQuarterTime / 60000);
        const remaining = Math.round((this.config.timeout - threeQuarterTime) / 60000);
        callbacks?.onProgress?.({
          type: 'warning',
          message: `Complex design detected. ${elapsed} minutes elapsed, ${remaining} minutes remaining`
        });
      }, threeQuarterTime);

      childProcess.on('close', (code) => {
        clearTimeout(mainTimeout);
        clearTimeout(halfwayWarning);
        clearTimeout(threeQuarterWarning);
        processInfo.isRunning = false;

        const success = code === 0;
        const response: CircuitronResponse = {
          success,
          files: {},
          logs,
          error: success ? undefined : stderr || 'Process failed with unknown error',
          duration: Date.now() - processInfo.startTime.getTime(),
          ...(actualOutputDir ? { actualOutputDir } : {}),
        };

        resolve(response);
      });

      childProcess.on('error', (error) => {
        clearTimeout(mainTimeout);
        clearTimeout(halfwayWarning);
        clearTimeout(threeQuarterWarning);
        processInfo.isRunning = false;
        reject(error);
      });
    });
  }

  private async processOutputFiles(response: CircuitronResponse, outputDir: string): Promise<void> {
    if (!response.success) {
      return;
    }

    try {
      const files = await fs.readdir(outputDir);

      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const ext = path.extname(file).toLowerCase();

        switch (ext) {
          case '.svg':
            response.files.schematic = filePath;
            break;
          case '.sch':
            response.files.schematicKicad = filePath;
            break;
          case '.kicad_pcb':
            response.files.pcb = filePath;
            break;
          case '.net':
            response.files.netlist = filePath;
            break;
          case '.py':
            if (file.includes('skidl')) {
              response.files.skidl = filePath;
            }
            break;
        }
      }

    } catch (error) {
      console.warn('Error processing output files:', error);
    }
  }

  /**
   * Recursively collect text artifacts (nested dirs, odd filenames).
   * Keys are relative POSIX paths so basenames don’t collide.
   */
  private async gatherArtifactsFromDirectory(
    outputDir: string,
  ): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};
    const wantExt = new Set([
      ".svg",
      ".net",
      ".kicad_pcb",
      ".kicad_sch",
      ".sch",      // KiCad 5 schematic format
      ".kicad_pro",
      ".erc",
    ]);

    const walk = async (absDir: string, relDir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const abs = path.join(absDir, ent.name);
        const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          await walk(abs, rel);
          continue;
        }
        const ext = path.extname(ent.name).toLowerCase();
        const low = ent.name.toLowerCase();
        const take =
          wantExt.has(ext) ||
          (ext === ".py" && low.includes("skidl"));
        if (!take) continue;
        try {
          const text = await fs.readFile(abs, "utf-8");
          merged[rel.split(path.sep).join("/")] = text;
        } catch {
          /* unreadable */
        }
      }
    };

    await walk(outputDir, "");
    return merged;
  }

  private parseProgressFromOutput(output: string): CircuitronProgressEvent | null {
    // Simple progress parsing - could be enhanced based on Circuitron's actual output format
    const lowerOutput = output.toLowerCase();

    if (lowerOutput.includes('planning')) {
      return { type: 'planning', message: 'Planning PCB design...' };
    } else if (lowerOutput.includes('part') && lowerOutput.includes('find')) {
      return { type: 'part_finding', message: 'Finding components...' };
    } else if (lowerOutput.includes('generat')) {
      return { type: 'code_generation', message: 'Generating PCB code...' };
    } else if (lowerOutput.includes('validat')) {
      return { type: 'validation', message: 'Validating design...' };
    } else if (lowerOutput.includes('complete')) {
      return { type: 'completed', message: 'PCB design completed!' };
    }

    return null;
  }

  private async cleanupTemporaryFiles(outputDir: string): Promise<void> {
    // Only cleanup if it's a temporary directory we created
    if (outputDir.includes(os.tmpdir())) {
      try {
        await fs.rmdir(outputDir, { recursive: true });
      } catch (error) {
        console.warn('Failed to cleanup temporary directory:', error);
      }
    }
  }

  private async runCommand(args: string[], options: { timeout?: number } = {}): Promise<CircuitronResponse> {
    return new Promise((resolve) => {
      const childProcess = this.spawnCircuitron(args);

      let stdout = '';
      let stderr = '';
      const logs: string[] = [];

      childProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        logs.push(text);
      });

      childProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        logs.push(`[ERROR] ${text}`);
      });

      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        resolve({
          success: false,
          files: {},
          logs,
          error: 'Command timed out'
        });
      }, options.timeout || 30000);

      childProcess.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          files: {},
          logs,
          error: code === 0 ? undefined : stderr || 'Command failed'
        });
      });
    });
  }
}

/**
 * Default Circuitron subprocess instance
 */
export const circuitronSubprocess = new CircuitronSubprocess();

/**
 * Simple wrapper function for one-off PCB design requests
 */
export async function generatePCB(
  prompt: string,
  options?: Partial<CircuitronRequest>
): Promise<CircuitronResponse> {
  return circuitronSubprocess.execute({
    prompt,
    projectName: options?.projectName || 'pcb-design',
    ...options
  });
}