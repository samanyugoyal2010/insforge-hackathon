#!/bin/bash

echo "🔧 Testing Circuitron file processing fix..."
echo

# Quick test to verify files are processed before cleanup
RESPONSE=$(timeout 180s curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": "simple LED", "projectName": "quick-test"}' \
  http://localhost:3000/api/circuitron/generate)

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ SUCCESS: Circuitron completed successfully"

    if echo "$RESPONSE" | grep -q '"files":{.*}' && ! echo "$RESPONSE" | grep -q '"files":{}'; then
        echo "✅ SUCCESS: Files were processed successfully"
        echo "🎉 Fix worked! Files are now being processed before cleanup."
        FILES=$(echo "$RESPONSE" | jq -r '.files' 2>/dev/null || echo "Could not parse files")
        echo "📁 Generated files: $FILES"
    else
        echo "⚠️  Files still empty - may need additional investigation"
    fi
else
    echo "❌ Test failed or still processing..."
    echo "Response: $RESPONSE" | head -5
fi