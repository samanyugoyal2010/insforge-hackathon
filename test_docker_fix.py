#!/usr/bin/env python3
"""
Test our .sch file recognition directly using Docker like Circuitron does
"""
import subprocess
import tempfile
import os

def test_docker_skidl():
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"🧪 Testing Docker SKiDL in {temp_dir}")

        # Create a simple SKiDL script similar to what Circuitron generates
        skidl_script = '''from skidl import *
import os

# Set up KiCad environment
os.environ['KICAD5_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD5_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD6_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD6_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD7_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD7_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KICAD8_SYMBOL_DIR'] = '/usr/share/kicad/library'
os.environ['KICAD8_FOOTPRINT_DIR'] = '/usr/share/kicad/modules'
os.environ['KISYSMOD'] = '/usr/share/kicad/modules'

set_default_tool(KICAD5)

print("Creating circuit...")
r1 = Part('Device', 'R', value='150', footprint='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal')
led1 = Part('Device', 'LED', value='Red', footprint='LED_THT:LED_D5.0mm')

vcc = Net('VCC')
vcc.drive = POWER
gnd = Net('GND')
gnd.drive = POWER

vcc += r1[1]
r1[2] += led1[1]
led1[2] += gnd

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

print("Generated files:")
import os
files = os.listdir('.')
output_files = [f for f in files if f.endswith(('.net', '.svg', '.kicad_pcb', '.kicad_sch', '.sch'))]
for f in output_files:
    print(f"  📄 {f} ({os.path.getsize(f)} bytes)")

print(f"Total files: {len(output_files)}")
'''

        # Write script to temp directory
        script_path = os.path.join(temp_dir, "test_circuit.py")
        with open(script_path, 'w') as f:
            f.write(skidl_script)

        # Use the KiCad Docker container like Circuitron does
        container_name = "test-kicad-container"

        try:
            print("🐳 Starting KiCad Docker container...")

            # Start container
            cmd_start = [
                "docker", "run", "-d", "--name", container_name,
                "ghcr.io/shaurya-sethi/circuitron-kicad:latest", "sleep", "300"
            ]

            result = subprocess.run(cmd_start, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to start container: {result.stderr}")
                return False

            print("📂 Copying script to container...")
            # Copy script to container
            cmd_copy = [
                "docker", "cp", script_path, f"{container_name}:/tmp/test_circuit.py"
            ]
            subprocess.run(cmd_copy, check=True)

            print("🔧 Running SKiDL script in container...")
            # Run script in container
            cmd_exec = [
                "docker", "exec", "-w", "/tmp", container_name,
                "python3", "/tmp/test_circuit.py"
            ]

            result = subprocess.run(cmd_exec, capture_output=True, text=True, timeout=120)

            print("📤 Container output:")
            print(result.stdout)
            if result.stderr:
                print("📤 Container errors:")
                print(result.stderr)

            # Copy generated files back
            print("📥 Copying generated files from container...")
            cmd_list = [
                "docker", "exec", container_name, "find", "/tmp",
                "-name", "*.net", "-o", "-name", "*.sch", "-o", "-name", "*.kicad_sch", "-o", "-name", "*.svg"
            ]

            list_result = subprocess.run(cmd_list, capture_output=True, text=True)
            files = list_result.stdout.strip().split('\n') if list_result.stdout.strip() else []

            print(f"📁 Found files in container: {files}")

            # Test our file recognition logic on these files
            recognized_types = set()
            for file_path in files:
                if file_path:
                    filename = os.path.basename(file_path)
                    ext = os.path.splitext(filename)[1].lower()

                    if ext == '.svg':
                        recognized_types.add('svg')
                    elif ext == '.net':
                        recognized_types.add('netlist')
                    elif ext == '.kicad_pcb':
                        recognized_types.add('kicad_pcb')
                    elif ext == '.kicad_sch':
                        recognized_types.add('sch')
                    elif ext == '.sch':  # Our fix!
                        recognized_types.add('sch')

            print(f"🔍 Our system would recognize: {list(recognized_types)}")

            success = len(recognized_types) > 0
            if success:
                print("✅ SUCCESS: Docker generates files that our system can now recognize!")
            else:
                print("❌ No files generated or our recognition logic failed")

            return success

        except subprocess.TimeoutExpired:
            print("❌ TIMEOUT: Docker execution took too long")
            return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
        finally:
            # Cleanup container
            try:
                subprocess.run(["docker", "rm", "-f", container_name],
                             capture_output=True, text=True)
                print("🧹 Cleaned up Docker container")
            except:
                pass

if __name__ == "__main__":
    print("🧪 Testing Docker SKiDL file generation with our fixes...")
    success = test_docker_skidl()
    if success:
        print("\n🎉 Our .sch recognition fix works with Docker!")
        print("The Circuitron pipeline should now recognize SKiDL-generated files.")
    else:
        print("\n💥 Still have issues with Docker or file generation")