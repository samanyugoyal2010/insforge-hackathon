#!/bin/bash

# Test the direct PCB generation API with CURL
# This bypasses all UI issues and tests the backend directly

echo "🧪 Testing PCB generation with CURL..."

# Test the direct endpoint
echo "📤 Sending houseplant monitor request..."
curl -X POST http://localhost:3000/api/pcb/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I want a tiny board that tells me when my houseplant soil is too dry—LED or gentle buzzer is enough, bonus if it can notify my phone later. Keep it beginner-friendly and cheap.",
    "projectName": "houseplant-curl-test"
  }' \
  --max-time 900 \
  --output pcb_result.json

echo ""
echo "⏱️  Request completed!"

if [ -f pcb_result.json ]; then
    echo "📄 Response saved to pcb_result.json"

    # Check if successful
    success=$(jq -r '.success // false' pcb_result.json)
    echo "✅ Success: $success"

    if [ "$success" = "true" ]; then
        # Show generated files
        files=$(jq -r '.files // {} | keys | join(", ")' pcb_result.json)
        contents=$(jq -r '.fileContentsByBasename // {} | keys | join(", ")' pcb_result.json)
        echo "📁 File URLs: $files"
        echo "📄 File contents: $contents"
        echo ""
        echo "🎉 SUCCESS! Houseplant monitor PCB generated!"
        echo "📋 You can now use the generated files for your PCB project."
    else
        error=$(jq -r '.error // "Unknown error"' pcb_result.json)
        echo "❌ Error: $error"
        echo ""
        echo "💥 PCB generation failed. Check the error above."
    fi
else
    echo "❌ No response file generated - request may have failed"
fi