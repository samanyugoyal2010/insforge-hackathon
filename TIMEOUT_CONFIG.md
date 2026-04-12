# Circuitron Timeout Configuration

## Overview

Circuitron has been configured with increased timeouts to handle complex PCB designs like ESP32 projects, USB-C circuits, and multi-component boards. Simple LED circuits still complete quickly (~2-3 minutes), while complex designs now have up to 15 minutes to complete successfully.

## Default Timeout Settings

| Component | Previous Timeout | New Timeout | Configuration |
|-----------|-----------------|-------------|---------------|
| Frontend API Route | ~5 minutes | 15 minutes | `maxDuration = 900` in route.ts |
| Backend Process | 5 minutes | 15 minutes | `CIRCUITRON_TIMEOUT_MS=900000` |
| Python Network | 5 minutes | 15 minutes | `CIRCUITRON_NETWORK_TIMEOUT=900` |
| Docker Script Execution | 3 minutes | 10 minutes | `timeout: int = 600` |

## Environment Variables

The following environment variables can be used to customize timeouts:

```bash
# Frontend/Backend timeout (milliseconds)
CIRCUITRON_TIMEOUT_MS=900000         # 15 minutes (default)

# Python backend network timeout (seconds)  
CIRCUITRON_NETWORK_TIMEOUT=900       # 15 minutes (default)

# Enable development mode for verbose logging
CIRCUITRON_DEV_MODE=true             # Optional
```

## Progress Indicators

Users now receive progress updates during long-running operations:

- **Halfway Point**: "Still processing... X minutes elapsed, Y minutes remaining"
- **75% Complete**: "Complex design detected. X minutes elapsed, Y minutes remaining"  
- **Final Warning**: Clear timeout message with suggestions if timeout occurs

## Expected Processing Times

| Circuit Complexity | Components | Expected Time | Example |
|-------------------|------------|---------------|---------|
| Simple | 2-3 components | 1-3 minutes | LED + resistor |
| Medium | 4-7 components | 3-7 minutes | Arduino + sensors |
| Complex | 8+ components | 7-15 minutes | ESP32 + USB-C + peripherals |

## Troubleshooting

### If timeouts still occur:

1. **Increase timeout further** (for very complex designs):
   ```bash
   export CIRCUITRON_TIMEOUT_MS=1800000  # 30 minutes
   export CIRCUITRON_NETWORK_TIMEOUT=1800
   ```

2. **Simplify the design**:
   - Break complex circuits into smaller modules
   - Generate subsystems separately
   - Use fewer custom components

3. **Check system resources**:
   - Ensure Docker has sufficient memory
   - Verify MCP server is running: `curl http://localhost:8051/health`
   - Check OpenAI API key is valid

### Log locations for debugging:

- **Frontend**: Browser developer console
- **Backend**: Terminal where Next.js is running  
- **Circuitron**: Look for Circuitron MCP container logs

## Success Metrics

With these changes, the platform should achieve:

- ✅ ESP32 circuits generate successfully within 15 minutes
- ✅ Simple circuits still complete within 2-3 minutes  
- ✅ Users see real-time progress updates
- ✅ Clear error messages when timeouts occur
- ✅ Platform handles multiple concurrent requests

## Rollback

To revert to original timeouts, remove or comment out these environment variables and restart the development server.