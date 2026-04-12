#!/bin/bash

# Test Circuitron with progressively more complex circuits

echo "🧪 Testing Circuitron with simple circuits..."
echo

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Please set OPENAI_API_KEY first"
    exit 1
fi

cd /Users/shlok/Downloads/biro-bun

# Test 1: Very simple LED circuit
echo "📍 Test 1: Simple LED circuit"
CIRCUITRON_SKIP_MCP_CHECK=1 circuitron --output-dir ./test_simple --keep-skidl "Design a simple LED circuit with a 330 ohm resistor connected to a 5V power jack"

echo
echo "📍 Test 1 completed. Check ./test_simple/ for results"
echo "Press Enter to continue to next test..."
read

# Test 2: Slightly more complex
echo "📍 Test 2: LED with switch"
CIRCUITRON_SKIP_MCP_CHECK=1 circuitron --output-dir ./test_switch --keep-skidl "Design an LED circuit with a 330 ohm resistor, push button switch, and barrel jack power connector"

echo
echo "📍 Test 2 completed. Check ./test_switch/ for results"