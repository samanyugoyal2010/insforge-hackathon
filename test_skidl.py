#!/usr/bin/env python3
"""Test script for SKiDL in KiCad container"""

from skidl import *

print("Testing SKiDL part creation...")

try:
    # Try creating a simple resistor
    r1 = Part('Device', 'R', value='150R', footprint='Resistor_SMD:R_0603')
    print("✅ Resistor creation successful")

    # Try creating an LED
    led1 = Part('Device', 'LED', value='Red', footprint='LED_THT:LED_D5.0mm')
    print("✅ LED creation successful")

    # Create nets
    vcc = Net('VCC')
    gnd = Net('GND')
    print("✅ Net creation successful")

    # Connect components
    vcc += r1[1]
    r1[2] += led1[1]  # Anode
    led1[2] += gnd    # Cathode
    print("✅ Component connections successful")

    # Run ERC
    ERC()
    print("✅ ERC completed")

    # Generate netlist
    generate_netlist()
    print("✅ Netlist generation successful")

    # Try to generate schematic
    generate_schematic()
    print("✅ Schematic generation successful")

    print("\n✅ All tests passed! SKiDL is working properly.")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()