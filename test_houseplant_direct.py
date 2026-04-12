#!/usr/bin/env python3
"""
Test direct PCB generation API with houseplant request
"""
import json
import requests
import time

def test_direct_pcb():
    print("🧪 Testing direct PCB generation API...")

    url = "http://localhost:3000/api/pcb/generate"
    payload = {
        "prompt": "I want a tiny board that tells me when my houseplant's soil is too dry—LED or gentle buzzer is enough, bonus if it can notify my phone later. Keep it beginner-friendly and cheap.",
        "projectName": "houseplant-monitor"
    }

    print(f"📤 Sending houseplant monitor request...")
    start_time = time.time()

    try:
        response = requests.post(url, json=payload, timeout=900)  # 15 minutes
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.1f} seconds")
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

            if success and (files or fileContents):
                print("🎉 SUCCESS! Houseplant monitor PCB generated!")
                return True
            else:
                print("💥 PCB generation failed")
                return False

        else:
            print(f"❌ HTTP Error {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {error_data}")
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
    success = test_direct_pcb()
    if success:
        print("\n🌱 Houseplant monitor PCB ready! The platform works correctly.")
    else:
        print("\n💥 Still have issues with PCB generation")