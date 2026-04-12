/**
 * API endpoint for testing Circuitron integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { circuitronSubprocess } from '@/lib/circuitron';
import { CircuitronRequest } from '@/lib/circuitron/types';

export const maxDuration = 900;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      prompt?: string;
      projectName?: string;
      test?: boolean;
    };

    if (body.test) {
      // Health check
      const health = await circuitronSubprocess.healthCheck();
      return NextResponse.json(health);
    }

    if (!body.prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const circuitronRequest: CircuitronRequest = {
      prompt: body.prompt,
      projectName: body.projectName || 'test-pcb',
      options: {
        noFootprintSearch: true, // For stability
        keepSkidl: true,
        dev: true
      }
    };

    // Execute Circuitron
    const response = await circuitronSubprocess.execute(circuitronRequest, {
      onProgress: (event) => {
        console.log('Circuitron progress:', event);
      },
      onLog: (message) => {
        console.log('Circuitron log:', message);
      }
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('Circuitron test error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        files: {},
        logs: []
      },
      { status: 500 }
    );
  }
}