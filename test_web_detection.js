#!/usr/bin/env node
// Test circuit complexity detection for web interface

const prompts = [
  "Simple LED circuit",
  "LED blink circuit",
  "USB-C connector with power regulators",
  "ESP32 development board",
  "Buzzer alarm circuit"
];

// Simulate the isSimpleCircuit logic from our implementation
function isSimpleCircuit(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  const simpleKeywords = [
    'led', 'resistor', 'buzzer', 'button', 'switch', 'diode',
    'light up', 'blink', 'simple circuit', 'basic circuit'
  ];

  const complexKeywords = [
    'usb-c', 'microcontroller', 'esp32', 'arduino', 'regulator', 'ldo',
    'switching', 'buck', 'boost', 'communication', 'uart', 'i2c', 'spi',
    'multiple voltages', 'power supply', 'amplifier', 'adc', 'dac'
  ];

  const hasComplexKeywords = complexKeywords.some(keyword => lowerPrompt.includes(keyword));
  if (hasComplexKeywords) {
    return false;
  }

  const hasSimpleKeywords = simpleKeywords.some(keyword => lowerPrompt.includes(keyword));
  const wordCount = prompt.trim().split(/\s+/).length;

  return hasSimpleKeywords && wordCount < 100;
}

console.log('🧪 Testing Circuit Complexity Detection for Web Interface');
console.log('=' .repeat(60));

prompts.forEach(prompt => {
  const isSimple = isSimpleCircuit(prompt);
  const mode = isSimple ? '🚀 FAST-PATH' : '🐌 FULL PIPELINE';
  const expected = isSimple ? '<2 min' : '<8 min';
  console.log(`${mode} "${prompt}" (${expected})`);
});

console.log('\n✅ Web interface ready for testing!');