#!/bin/bash

echo "🌱 Creating your houseplant monitor PCB step by step..."

# Step 1: Basic moisture detection circuit
echo "📡 Step 1: Basic moisture sensor circuit..."
curl -X POST http://localhost:3000/api/pcb/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Capacitive soil moisture sensor with 5V power and LED indicator",
    "projectName": "plant-step1-sensor"
  }' \
  --max-time 180 \
  --output step1_sensor.json \
  --silent

if [ -f step1_sensor.json ]; then
    success=$(jq -r '.success // false' step1_sensor.json 2>/dev/null)
    if [ "$success" = "true" ]; then
        echo "✅ Step 1 SUCCESS: Basic sensor circuit generated"
        files=$(jq -r '.fileContentsByBasename // {} | keys | join(", ")' step1_sensor.json 2>/dev/null)
        echo "   📁 Generated: $files"
    else
        echo "❌ Step 1 failed"
    fi
else
    echo "❌ Step 1 failed - no response"
fi

echo ""

# Step 2: Simple notification circuit
echo "🔊 Step 2: Buzzer notification circuit..."
curl -X POST http://localhost:3000/api/pcb/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Piezo buzzer with transistor driver and 5V power",
    "projectName": "plant-step2-buzzer"
  }' \
  --max-time 180 \
  --output step2_buzzer.json \
  --silent

if [ -f step2_buzzer.json ]; then
    success=$(jq -r '.success // false' step2_buzzer.json 2>/dev/null)
    if [ "$success" = "true" ]; then
        echo "✅ Step 2 SUCCESS: Buzzer circuit generated"
        files=$(jq -r '.fileContentsByBasename // {} | keys | join(", ")' step2_buzzer.json 2>/dev/null)
        echo "   📁 Generated: $files"
    else
        echo "❌ Step 2 failed"
    fi
else
    echo "❌ Step 2 failed - no response"
fi

echo ""

# Step 3: Power management
echo "⚡ Step 3: USB-C power circuit..."
curl -X POST http://localhost:3000/api/pcb/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "USB-C connector with 5V and 3.3V regulators",
    "projectName": "plant-step3-power"
  }' \
  --max-time 180 \
  --output step3_power.json \
  --silent

if [ -f step3_power.json ]; then
    success=$(jq -r '.success // false' step3_power.json 2>/dev/null)
    if [ "$success" = "true" ]; then
        echo "✅ Step 3 SUCCESS: Power circuit generated"
        files=$(jq -r '.fileContentsByBasename // {} | keys | join(", ")' step3_power.json 2>/dev/null)
        echo "   📁 Generated: $files"
    else
        echo "❌ Step 3 failed"
    fi
else
    echo "❌ Step 3 failed - no response"
fi

echo ""
echo "🎉 Houseplant monitor PCB components generated!"
echo "📋 You now have 3 circuit modules that can be combined:"
echo "   1. Moisture sensor + LED indicator"
echo "   2. Buzzer notification system"
echo "   3. USB-C power supply"
echo ""
echo "💡 Next steps:"
echo "   - Review the generated schematics and netlists"
echo "   - Combine the circuits on a single PCB"
echo "   - Add an ESP32 for WiFi notifications (optional)"