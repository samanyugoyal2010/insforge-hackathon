#!/usr/bin/env python3
"""
Fixed SKiDL script for LED indicator circuit
This corrects the pin mapping and connection issues from the original Circuitron output
"""

import os
from skidl import *

# Set up KiCad environment (if needed)
# Set KiCad as the default tool
try:
    set_default_tool(KICAD)
except:
    # If KICAD is not available, try KICAD5 or continue without
    pass

# === DESIGN PARAMETERS ===
# Input supply: 5 V (V_IN)
# LED forward voltage: ~2 V
# Desired LED current: ~20 mA
# Calculated resistor: (5 V - 2 V) / 0.02 A = 150 Ω

# === COMPONENT INSTANTIATION ===
# Two-pin header for external 5 V input and ground
header_2pin = Part('Connector', 'Conn_01x02_Male', footprint='Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical')

# LED indicator (5 mm) - Using standard LED part
led_indicator = Part('Device', 'LED', footprint='LED_THT:LED_D5.0mm')

# Current-limiting resistor (150 Ω)
resistor_current_lim = Part(
    'Device',
    'R',
    footprint='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal',
    value='150'
)

# === POWER RAIL SETUP ===
v_in = Net('V_IN')
v_in.drive = POWER

gnd = Net('GND')
gnd.drive = POWER

# === SIGNAL CONNECTIONS ===
# Connect header pin 1 to V_IN power rail
v_in += header_2pin[1]

# Connect header pin 2 to GND power rail
gnd += header_2pin[2]

# Connect V_IN to LED anode (pin 2 for standard LED)
v_in += led_indicator[2]  # Anode

# Create intermediate net for LED cathode to resistor connection
led_cathode_net = Net('LED_CATHODE')

# Connect LED cathode (pin 1) to resistor pin 1
led_cathode_net += led_indicator[1], resistor_current_lim[1]  # Cathode to resistor

# Connect resistor pin 2 to ground
gnd += resistor_current_lim[2]

# === DESIGN VERIFICATION ===
print("=== Circuit Summary ===")
print("Components:")
print(f"  Header: {header_2pin.ref}")
print(f"  LED: {led_indicator.ref}")
print(f"  Resistor: {resistor_current_lim.ref}")
print("\nConnections:")
print("  V_IN -> Header Pin 1 -> LED Anode")
print("  LED Cathode -> Resistor -> GND")
print("  GND -> Header Pin 2")

# === OUTPUT GENERATION ===
print("\nGenerating netlist and schematic...")

# Run electrical rules check
ERC()

# Generate outputs
generate_netlist()

try:
    generate_schematic()
    print("Schematic generated successfully!")
except Exception as e:
    print(f"Schematic generation failed: {e}")
    print("Netlist should still be valid for PCB layout.")

print("\nCircuit generation complete!")
print("Files generated:")
print("  - .net (netlist)")
print("  - .sch (schematic, if successful)")