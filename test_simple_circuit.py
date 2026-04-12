#!/usr/bin/env python3
"""
Test with the simplest possible PCB request to verify the system works
"""
import requests
import json

def test_simple():
    print("🧪 Testing with the simplest possible circuit...")

    url = "http://localhost:3000/api/pcb/generate"
    payload = {
        "prompt": "Single LED with 330 ohm resistor",
        "projectName": "simple-led"
    }

    print(f"📤 Sending simple LED request...")

    try:
        response = requests.post(url, json=payload, timeout=300)  # 5 minutes

        print(f"📊 HTTP Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()

            success = result.get('success', False)
            files = result.get('files', {})
            fileContents = result.get('fileContentsByBasename', {})
            error = result.get('error')

            print(f"✅ Success: {success}")
            print(f"📁 File URLs: {list(files.keys())}")
            print(f"📄 File contents: {list(fileContents.keys())}")

            if error:
                print(f"❌ Error: {error}")

            if success:
                print("🎉 SUCCESS! Simple LED circuit generated!")

                # Show some content
                if fileContents:
                    for filename, content in list(fileContents.items())[:2]:
                        print(f"\n📄 {filename} ({len(content)} chars):")
                        print(content[:200] + "..." if len(content) > 200 else content)

                return True
            else:
                print("💥 Simple circuit generation failed")
                return False

        else:
            print(f"❌ HTTP Error {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error: {error_data}")
            except:
                print(response.text[:500])
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_simple()
    if success:
        print("\n✅ The PCB platform works! You can generate circuits via the direct API.")
        print("For complex circuits like the houseplant monitor, try breaking it into simpler parts.")
    else:
        print("\n💥 Still have issues - the platform needs debugging.")