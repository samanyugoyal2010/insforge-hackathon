#!/usr/bin/env python3
"""
Quick verification script to test if our Circuitron fixes work
"""
import json
import requests
import time

def test_circuitron_fix():
    print("🧪 Testing Circuitron file generation fix...")

    url = "http://localhost:3000/api/circuitron/generate"
    payload = {
        "prompt": "Create a simple LED circuit with a 5V power source, red LED, and 150 ohm current limiting resistor",
        "projectName": "fix-verification"
    }

    print("📤 Sending test request...")
    start_time = time.time()

    try:
        response = requests.post(url, json=payload, timeout=300)  # 5 minute timeout
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.1f} seconds")

        if response.status_code == 200:
            result = response.json()

            if result.get('success'):
                files = result.get('files', {})
                print("✅ SUCCESS!")
                print(f"📁 Generated files: {list(files.keys())}")

                # Check for key file types
                expected_files = ['netlist', 'schematic']
                found_files = []
                missing_files = []

                for file_type in expected_files:
                    if file_type in files:
                        found_files.append(file_type)
                    else:
                        missing_files.append(file_type)

                if found_files:
                    print(f"✅ Found: {', '.join(found_files)}")
                if missing_files:
                    print(f"⚠️  Missing: {', '.join(missing_files)}")

                return len(found_files) > 0
            else:
                print("❌ Request succeeded but generation failed")
                print(f"Error: {result.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ HTTP Error {response.status_code}")
            print(response.text)
            return False

    except requests.exceptions.Timeout:
        print("❌ Request timed out (>5 minutes)")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_circuitron_fix()
    if success:
        print("\n🎉 Circuitron file generation is working!")
    else:
        print("\n💥 Circuitron still has issues - check logs for details")