#!/usr/bin/env python3
from skidl import *

# Set up environment
import os
os.environ['KICAD5_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD5_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD6_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD6_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD7_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD7_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD8_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD8_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KISYSMOD'] = '/usr/share/kicad/modules'

# Set tool
set_default_tool(KICAD5)

print("Creating circuit...")

# Create components
r1 = Part('Device', 'R', value='150', footprint='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal')
led1 = Part('Device', 'LED', value='Red', footprint='LED_THT:LED_D5.0mm')

# Create nets
vcc = Net('VCC')
vcc.drive = POWER
gnd = Net('GND')
gnd.drive = POWER

print("Connecting components...")

# Connect
vcc += r1[1]
r1[2] += led1[1]  # Anode
led1[2] += gnd    # Cathode

print("Running ERC...")
ERC()

print("Generating netlist...")
generate_netlist()

print("Generating schematic...")
try:
    generate_schematic()
    print("✅ Schematic generation successful")
except Exception as e:
    print(f"❌ Schematic generation failed: {e}")

print("Listing generated files...")
import os
files = os.listdir('.')
output_files = [f for f in files if f.endswith(('.net', '.svg', '.kicad_pcb', '.kicad_sch'))]
print(f"Found {len(output_files)} output files: {output_files}")

print("Done!")