#!/usr/bin/env python3
"""
Quick verification of Circuitron UI fixes - minimal test with simple circuit
"""
import json
import requests
import time

def test_ui_fix():
    print("🧪 Testing Circuitron UI with simple circuit...")

    url = "http://localhost:3000/api/circuitron/generate"
    payload = {
        "prompt": "Single resistor 1k ohm",  # Simplest possible circuit
        "projectName": "simple-test"
    }

    print(f"📤 Sending simple resistor request to {url}")
    start_time = time.time()

    try:
        response = requests.post(url, json=payload, timeout=180)  # 3 minute timeout
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.1f} seconds")
        print(f"📊 HTTP Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()

            success = result.get('success', False)
            files = result.get('files', {})
            error = result.get('error')

            print(f"✅ Success: {success}")
            print(f"📁 Files generated: {list(files.keys())}")

            if error:
                print(f"❌ Error: {error}")

            return success and len(files) > 0

        else:
            print(f"❌ HTTP Error {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {error_data.get('error', 'Unknown')}")
            except:
                print(response.text[:200])
            return False

    except requests.exceptions.Timeout:
        duration = time.time() - start_time
        print(f"❌ Request timed out after {duration:.1f} seconds")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_ui_fix()
    if success:
        print("\n🎉 Circuitron UI is working! Files are being generated and recognized.")
        print("The timeout and file recognition fixes are successful.")
    else:
        print("\n💥 Still have UI issues - check the output above")
        print("The platform may need additional optimization for production use.")