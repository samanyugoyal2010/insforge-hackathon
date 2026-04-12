#!/usr/bin/env python3
"""Test if the skip-planning flag actually works."""

import subprocess
import sys
import os
import tempfile

def test_skip_planning():
    print("Testing --skip-planning flag")
    print("=" * 30)

    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Test with skip-planning flag
            result = subprocess.run([
                sys.executable, "-m", "circuitron",
                "--skip-planning",
                "--output-dir", temp_dir,
                "Simple LED circuit"
            ],
            cwd="circuitron-integration/circuitron-integration",
            capture_output=True,
            text=True,
            timeout=60)  # 1 minute timeout for testing

            print(f"Exit code: {result.returncode}")
            print("STDOUT:")
            print(result.stdout[:1000] + "..." if len(result.stdout) > 1000 else result.stdout)
            print("STDERR:")
            print(result.stderr[:500] + "..." if len(result.stderr) > 500 else result.stderr)

            # Check if fast-path was actually used
            if "🚀 Using fast-path mode" in result.stdout:
                print("✅ SUCCESS: Fast-path mode was triggered!")
                return True
            else:
                print("❌ FAIL: Fast-path mode not detected in output")
                return False

        except subprocess.TimeoutExpired:
            print("⏱️ TIMEOUT: Test took too long (>60s)")
            return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False

if __name__ == "__main__":
    test_skip_planning()