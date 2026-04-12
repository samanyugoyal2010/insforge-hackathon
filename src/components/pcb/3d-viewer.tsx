/**
 * 3D PCB Viewer Component
 * Now uses realistic 2D PCB layout that's actually useful for engineers
 */

'use client';

import { ProcessedFile } from '@/lib/circuitron';
import { RealisticPCBViewer } from './realistic-pcb-viewer';

interface PCB3DViewerProps {
  /** PCB file data from Circuitron */
  pcbFile?: ProcessedFile;
  /** Whether the viewer is loading */
  loading?: boolean;
  /** Error message if any */
  error?: string;
  /** Additional CSS classes */
  className?: string;
}

export function PCB3DViewer({
  pcbFile,
  loading = false,
  error,
  className = ''
}: PCB3DViewerProps) {
  return (
    <RealisticPCBViewer
      pcbFile={pcbFile}
      loading={loading}
      error={error}
      className={className}
    />
  );
}