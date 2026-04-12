#!/usr/bin/env python3
"""
Test our fallback directory fix
"""
import json
import requests
import time

def test_fallback_fix():
    print("🧪 Testing Circuitron fallback directory fix...")

    url = "http://localhost:3000/api/circuitron/generate"
    payload = {
        "prompt": "Two resistors in series 1k each",
        "projectName": "fallback-test"
    }

    print(f"📤 Sending request: {payload['prompt']}")
    start_time = time.time()

    try:
        response = requests.post(url, json=payload, timeout=180)  # 3 minutes
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.1f} seconds")
        print(f"📊 HTTP Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()

            success = result.get('success', False)
            files = result.get('files', {})
            error = result.get('error')
            logs = result.get('logs', [])

            print(f"✅ Success: {success}")
            print(f"📁 Files generated: {list(files.keys())}")

            if error:
                print(f"❌ Error: {error}")

            # Look for our debug message in logs
            fallback_logs = [log for log in logs if 'default Circuitron output' in str(log)]
            if fallback_logs:
                print("🔄 Fallback directory used:")
                for log in fallback_logs:
                    print(f"   {log}")

            return success and len(files) > 0

        else:
            print(f"❌ HTTP Error {response.status_code}")
            return False

    except requests.exceptions.Timeout:
        duration = time.time() - start_time
        print(f"❌ Request timed out after {duration:.1f} seconds")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_fallback_fix()
    if success:
        print("\n🎉 Fallback directory fix works! Files found and recognized.")
    else:
        print("\n💥 Still have directory issues")