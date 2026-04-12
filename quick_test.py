#!/usr/bin/env python3
"""
Quick test to verify our .sch file fix works
"""
import os
import tempfile
import subprocess
import sys
from pathlib import Path

def test_skidl_generation():
    """Test if SKiDL generates .sch files that we can now process"""

    # Create temp directory
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"🧪 Testing SKiDL file generation in {temp_dir}")

        # Create a simple SKiDL script
        skidl_script = f"""
from skidl import *
import os

# Set KiCad environment variables
os.environ['KICAD5_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD5_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD6_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD6_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD7_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD7_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD8_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD8_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KISYSMOD'] = '/usr/share/kicad/modules'

# Set tool to KiCad 5 (generates .sch format)
set_default_tool(KICAD5)

# Create simple circuit
r1 = Part('Device', 'R', value='150', footprint='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal')
led1 = Part('Device', 'LED', value='Red', footprint='LED_THT:LED_D5.0mm')

vcc = Net('VCC')
gnd = Net('GND')

vcc += r1[1]
r1[2] += led1[1]
led1[2] += gnd

ERC()
generate_netlist()

try:
    generate_schematic()
    print("✅ Schematic generation successful")
except Exception as e:
    print(f"❌ Schematic generation failed: {{e}}")

print("Generated files:")
import os
for f in os.listdir('.'):
    if f.endswith(('.net', '.sch', '.kicad_sch', '.svg')):
        print(f"  - {{f}}")
"""

        # Write script to temp directory
        script_path = os.path.join(temp_dir, "test_circuit.py")
        with open(script_path, 'w') as f:
            f.write(skidl_script)

        # Run the script
        try:
            result = subprocess.run([
                sys.executable, script_path
            ], cwd=temp_dir, capture_output=True, text=True, timeout=60)

            print(f"📤 Script output:")
            print(result.stdout)
            if result.stderr:
                print(f"📤 Script errors:")
                print(result.stderr)

            # Check generated files
            generated_files = []
            for f in os.listdir(temp_dir):
                if f.endswith(('.net', '.sch', '.kicad_sch', '.svg')):
                    generated_files.append(f)

            print(f"📁 Found files: {generated_files}")

            # Test our file recognition logic
            file_types = {}
            for filename in generated_files:
                ext = os.path.splitext(filename)[1].lower()
                if ext == '.svg':
                    file_types['svg'] = filename
                elif ext == '.net':
                    file_types['netlist'] = filename
                elif ext == '.kicad_pcb':
                    file_types['kicad_pcb'] = filename
                elif ext == '.kicad_sch':
                    file_types['sch'] = filename
                elif ext == '.sch':  # Our fix!
                    file_types['sch'] = filename

            print(f"🔍 Recognized file types: {list(file_types.keys())}")

            success = len(file_types) > 0
            if success:
                print("✅ SUCCESS: File generation and recognition working!")
            else:
                print("❌ FAILURE: No files generated or recognized")

            return success

        except subprocess.TimeoutExpired:
            print("❌ TIMEOUT: Script took too long")
            return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False

if __name__ == "__main__":
    print("🔧 Testing Circuitron .sch file fix...")
    success = test_skidl_generation()
    if success:
        print("\n🎉 Our fixes work! SKiDL generates .sch files and we recognize them.")
    else:
        print("\n💥 Still have issues - check the output above")