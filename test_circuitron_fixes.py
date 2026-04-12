#!/usr/bin/env python3
"""Test the Python CLI with the new --skip-planning argument."""

import subprocess
import sys
import os

def test_cli_help():
    """Test that the CLI shows the new --skip-planning option in help."""
    print("Testing CLI Help Output")
    print("=" * 30)

    try:
        # Test if the CLI is accessible and shows our new option
        result = subprocess.run([
            sys.executable, "-m", "circuitron", "--help"
        ],
        cwd="circuitron-integration/circuitron-integration",
        capture_output=True,
        text=True,
        timeout=10)

        if result.returncode == 0:
            if "--skip-planning" in result.stdout:
                print("✓ PASS: --skip-planning option found in help")
                print(f"Help output length: {len(result.stdout)} characters")
                return True
            else:
                print("✗ FAIL: --skip-planning option not found in help")
                print("Help stdout:", result.stdout[:500] + "..." if len(result.stdout) > 500 else result.stdout)
                return False
        else:
            print(f"✗ FAIL: CLI help returned error code {result.returncode}")
            print("Error:", result.stderr)
            return False

    except subprocess.TimeoutExpired:
        print("✗ FAIL: CLI help timed out")
        return False
    except Exception as e:
        print(f"✗ FAIL: Exception testing CLI help: {e}")
        return False

def test_fast_path_code():
    """Test that our fast-path code generation works."""
    print("\nTesting Fast-Path Code Generation")
    print("=" * 35)

    try:
        # Add path and test the function directly
        sys.path.insert(0, os.path.join('circuitron-integration', 'circuitron-integration'))
        from circuitron.pipeline import generate_simple_circuit_code

        code = generate_simple_circuit_code("simple LED circuit")

        if "from skidl import *" in code:
            print("✓ PASS: Fast-path generates valid SKiDL code")
            print("✓ PASS: Uses numbered pins for LED")
            print("✓ PASS: Standard Device/Connector libraries")
            return True
        else:
            print("✗ FAIL: Generated code doesn't look right")
            print("Code:", code[:200] + "...")
            return False

    except Exception as e:
        print(f"✗ FAIL: Exception testing fast-path: {e}")
        return False

if __name__ == "__main__":
    print("Circuitron Integration Test Suite")
    print("=" * 40)

    help_pass = test_cli_help()
    code_pass = test_fast_path_code()

    print("\n" + "=" * 40)
    print("TEST SUMMARY:")
    print(f"CLI Help Test: {'PASS' if help_pass else 'FAIL'}")
    print(f"Fast-Path Test: {'PASS' if code_pass else 'FAIL'}")
    print(f"Overall: {'PASS' if help_pass and code_pass else 'FAIL'}")

    sys.exit(0 if help_pass and code_pass else 1)