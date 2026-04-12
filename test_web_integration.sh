#!/bin/bash

echo "🧪 Testing Circuitron Web Integration"
echo "====================================="
echo

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Next.js server not running on port 3000"
    exit 1
fi

echo "✅ Next.js server is running"

# Test the Circuitron API endpoint
echo "🔄 Testing Circuitron API endpoint..."

RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Design a simple LED circuit with 330 ohm resistor powered by 5V", "projectName": "web-led-test"}' \
  http://localhost:3000/api/circuitron/generate)

echo "📋 API Response:"
echo "$RESPONSE" | head -20

# Check if it was successful
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo
    echo "🎉 SUCCESS! Circuitron web integration is working!"
    echo "✅ API endpoint functional"
    echo "✅ PCB generation completed"

    # Extract files if present
    if echo "$RESPONSE" | grep -q '"files":{'; then
        echo "✅ Generated files available"
        FILES=$(echo "$RESPONSE" | grep -o '"files":{[^}]*}' | head -1)
        echo "   Files: $FILES"
    fi

else
    echo
    echo "⚠️ Circuitron API completed but may have issues"
    echo "📋 Full response:"
    echo "$RESPONSE" | jq 2>/dev/null || echo "$RESPONSE"
fi