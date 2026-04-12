/**
 * File processor for Circuitron output files
 * Handles conversion and optimization of PCB files for browser display
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CircuitronFileInfo } from './types';

export interface ProcessedFile {
  /** Original file path */
  originalPath: string;
  /** Processed file path (may be the same) */
  processedPath: string;
  /** File type */
  type: 'svg' | 'kicad_pcb' | 'sch' | 'netlist' | 'skidl' | 'erc';
  /** File content (for small files like SVG) */
  content?: string;
  /** Base64 encoded content (for binary files) */
  base64?: string;
  /** Metadata about the file */
  metadata: {
    size: number;
    created: Date;
    optimized: boolean;
    readyForBrowser: boolean;
    /** True when layout is a tool/mock preview, not KiCad copper */
    syntheticLayout?: boolean;
    sourceFormat?: "kicad_pcb" | "svg_preview" | "pcbflow_kicad_style_svg" | string;
  };
}

export class CircuitronFileProcessor {
  private outputBaseUrl: string;
  private maxFileSize: number;

  constructor(outputBaseUrl = '/api/circuitron/files', maxFileSize = 10 * 1024 * 1024) {
    this.outputBaseUrl = outputBaseUrl;
    this.maxFileSize = maxFileSize;
  }

  /**
   * Process all files from a Circuitron output directory
   */
  async processOutputFiles(outputDir: string): Promise<{
    schematic?: ProcessedFile;
    schematicKicad?: ProcessedFile;
    pcb?: ProcessedFile;
    netlist?: ProcessedFile;
    skidl?: ProcessedFile;
    erc?: ProcessedFile;
  }> {
    const results: { [key: string]: ProcessedFile } = {};

    try {
      const files = await this.getOutputFiles(outputDir);

      for (const fileInfo of files) {
        if (fileInfo.type === "log") continue;
        const processed = await this.processFile(
          fileInfo.path,
          fileInfo.type === "erc" ? "erc" : fileInfo.type,
        );
        if (processed) {
          if (fileInfo.type === "erc") {
            results.erc = processed;
          } else {
            results[fileInfo.type] = processed;
          }
        }
      }

    } catch (error) {
      console.error('Error processing output files:', error);
    }

    return results;
  }

  /**
   * Process a single file for browser compatibility
   */
  async processFile(filePath: string, type: ProcessedFile['type']): Promise<ProcessedFile | null> {
    try {
      const stats = await fs.stat(filePath);

      if (stats.size > this.maxFileSize) {
        console.warn(`File too large to process: ${filePath} (${stats.size} bytes)`);
        return null;
      }

      const processed: ProcessedFile = {
        originalPath: filePath,
        processedPath: filePath,
        type,
        metadata: {
          size: stats.size,
          created: stats.birthtime,
          optimized: false,
          readyForBrowser: false
        }
      };

      switch (type) {
        case 'svg':
          return await this.processSVG(processed);
        case 'kicad_pcb':
          return await this.processKiCadPCB(processed);
        case 'sch':
          return await this.processKiCadSchematic(processed);
        case 'netlist':
          return await this.processNetlist(processed);
        case 'erc':
          return await this.processErcReport(processed);
        case 'skidl':
          return await this.processSKiDL(processed);
        default:
          return processed;
      }

    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Process SVG schematic files for browser display
   */
  private async processSVG(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      let content = await fs.readFile(file.originalPath, 'utf-8');

      // Optimize SVG for browser display
      content = this.optimizeSVG(content);

      file.content = content;
      file.metadata.optimized = true;
      file.metadata.readyForBrowser = true;

      return file;

    } catch (error) {
      console.error('Error processing SVG:', error);
      return file;
    }
  }

  /**
   * Process KiCad PCB files
   */
  private async processKiCadPCB(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      // For now, just read the content - could be enhanced to parse and optimize
      const content = await fs.readFile(file.originalPath, 'utf-8');
      file.content = content;
      file.metadata.readyForBrowser = true;

      return file;

    } catch (error) {
      console.error('Error processing KiCad PCB:', error);
      return file;
    }
  }

  /**
   * Process KiCad V5 schematic files
   */
  private async processKiCadSchematic(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const content = await fs.readFile(file.originalPath, 'utf-8');

      // KiCad V5 schematic files are text-based and can be displayed
      file.content = content;
      file.metadata.readyForBrowser = true;
      file.metadata.sourceFormat = "kicad_sch";

      return file;

    } catch (error) {
      console.error('Error processing KiCad schematic:', error);
      return file;
    }
  }

  /**
   * Process KiCad ERC report text
   */
  private async processErcReport(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const content = await fs.readFile(file.originalPath, 'utf-8');
      file.content = content;
      file.metadata.readyForBrowser = true;
      return file;
    } catch (error) {
      console.error('Error processing ERC report:', error);
      return file;
    }
  }

  /**
   * Process netlist files
   */
  private async processNetlist(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const content = await fs.readFile(file.originalPath, 'utf-8');
      file.content = content;
      file.metadata.readyForBrowser = true;

      return file;

    } catch (error) {
      console.error('Error processing netlist:', error);
      return file;
    }
  }

  /**
   * Process SKiDL script files
   */
  private async processSKiDL(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const content = await fs.readFile(file.originalPath, 'utf-8');

      // Add syntax highlighting hints for better display
      file.content = this.optimizeSKiDLContent(content);
      file.metadata.optimized = true;
      file.metadata.readyForBrowser = true;

      return file;

    } catch (error) {
      console.error('Error processing SKiDL:', error);
      return file;
    }
  }

  /**
   * Optimize SVG content for browser display
   */
  private optimizeSVG(svgContent: string): string {
    // Add viewport and responsive attributes
    let optimized = svgContent;

    // Ensure SVG has proper viewport
    if (!optimized.includes('viewBox')) {
      // Extract width and height if present
      const widthMatch = optimized.match(/width="(\d+(\.\d+)?)"/);
      const heightMatch = optimized.match(/height="(\d+(\.\d+)?)"/);

      if (widthMatch && heightMatch) {
        const width = parseFloat(widthMatch[1]);
        const height = parseFloat(heightMatch[1]);

        optimized = optimized.replace(
          '<svg',
          `<svg viewBox="0 0 ${width} ${height}"`
        );
      }
    }

    // Add CSS classes for better styling
    optimized = optimized.replace(
      '<svg',
      '<svg class="circuitron-schematic"'
    );

    // Remove unnecessary metadata that might cause display issues
    optimized = optimized.replace(/<!--[\s\S]*?-->/g, "");

    return optimized;
  }

  /**
   * Optimize SKiDL content for display
   */
  private optimizeSKiDLContent(content: string): string {
    // Add helpful comments and clean up formatting
    let optimized = content;

    // Add header comment if not present
    if (!optimized.includes('SKiDL Generated Code')) {
      optimized = `# SKiDL Generated Code\n# Generated by Circuitron\n\n${optimized}`;
    }

    return optimized;
  }

  /**
   * Get list of output files with their types
   */
  private async getOutputFiles(outputDir: string): Promise<CircuitronFileInfo[]> {
    const files: CircuitronFileInfo[] = [];

    try {
      const dirContents = await fs.readdir(outputDir);

      for (const filename of dirContents) {
        const filePath = path.join(outputDir, filename);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const ext = path.extname(filename).toLowerCase();
          let type: CircuitronFileInfo['type'] | null = null;

          switch (ext) {
            case '.svg':
              type = 'svg';
              break;
            case '.kicad_pcb':
              type = 'kicad_pcb';
              break;
            case '.sch':
              type = 'sch';
              break;
            case '.net':
              type = 'netlist';
              break;
            case '.py':
              if (filename.includes('skidl')) {
                type = 'skidl';
              }
              break;
        case '.log':
          type = 'log';
          break;
        case '.erc':
          type = 'erc';
          break;
      }

          if (type) {
            files.push({
              path: filePath,
              type,
              size: stats.size,
              created: stats.birthtime,
              ready: true
            });
          }
        }
      }

    } catch (error) {
      console.error('Error reading output directory:', error);
    }

    return files;
  }

  /**
   * Copy processed files to a public directory for serving
   */
  async copyToPublic(processedFiles: { [key: string]: ProcessedFile }, publicDir: string): Promise<{ [key: string]: string }> {
    const publicPaths: { [key: string]: string } = {};

    try {
      await fs.mkdir(publicDir, { recursive: true });

      for (const [type, file] of Object.entries(processedFiles)) {
        const filename = `${type}-${Date.now()}${path.extname(file.originalPath)}`;
        const publicPath = path.join(publicDir, filename);

        if (file.content) {
          await fs.writeFile(publicPath, file.content, 'utf-8');
        } else {
          await fs.copyFile(file.originalPath, publicPath);
        }

        publicPaths[type] = `/api/circuitron/files/${filename}`;
      }

    } catch (error) {
      console.error('Error copying files to public directory:', error);
    }

    return publicPaths;
  }
}

/**
 * Default file processor instance
 */
export const circuitronFileProcessor = new CircuitronFileProcessor();