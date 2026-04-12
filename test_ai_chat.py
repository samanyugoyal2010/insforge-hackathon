#!/usr/bin/env python3
"""
Test the AI chat endpoint that was showing network errors
"""
import json
import requests
import time

def test_ai_chat():
    print("🧪 Testing AI chat endpoint (the one showing network errors)...")

    url = "http://localhost:3000/api/ai/chat"
    payload = {
        "message": "I want a tiny board that tells me when my houseplant's soil is too dry—LED or gentle buzzer is enough, bonus if it can notify my phone later. Keep it beginner-friendly and cheap.",
        "projectName": "houseplant-test",
        "stream": False  # Use non-streaming for easier testing
    }

    print(f"📤 Sending AI chat request...")
    start_time = time.time()

    try:
        response = requests.post(url, json=payload, timeout=180)  # 3 minutes for initial test
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.1f} seconds")
        print(f"📊 HTTP Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()

            reply = result.get('reply', '')
            nextState = result.get('nextState', {})
            toolCalls = result.get('toolCalls', [])

            print(f"🤖 AI Reply: {reply[:200]}...")
            print(f"🔧 Tool calls: {len(toolCalls)}")
            print(f"📊 Next state keys: {list(nextState.keys())}")

            if 'circuitronResults' in nextState:
                cr = nextState['circuitronResults']
                print(f"🔌 Circuitron success: {cr.get('success', False)}")
                print(f"📁 Circuitron files: {list(cr.get('files', {}).keys())}")
                if cr.get('error'):
                    print(f"❌ Circuitron error: {cr['error']}")

            return True

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
    success = test_ai_chat()
    if success:
        print("\n✅ AI chat endpoint works!")
    else:
        print("\n💥 AI chat endpoint has issues")