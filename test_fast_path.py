#!/usr/bin/env python3
"""Test script for the improved Circuitron fast-path generation."""

import sys
import os

# Add the circuitron-integration path
sys.path.insert(0, os.path.join(os.getcwd(), 'circuitron-integration', 'circuitron-integration'))

from circuitron.pipeline import generate_simple_circuit_code

def test_fast_path():
    """Test fast-path code generation for different circuit types."""

    test_cases = [
        ("Simple LED circuit", "led light up"),
        ("Buzzer circuit", "buzzer sound beep"),
        ("Default circuit", "simple circuit board"),
    ]

    print("Testing Circuitron Fast-Path Code Generation")
    print("=" * 50)

    for name, prompt in test_cases:
        print(f"\n{name.upper()}")
        print("-" * len(name))
        print(f"Prompt: '{prompt}'")
        print("\nGenerated SKiDL code:")
        print("```python")
        code = generate_simple_circuit_code(prompt)
        print(code)
        print("```")
        print("\n" + "=" * 50)

if __name__ == "__main__":
    test_fast_path()