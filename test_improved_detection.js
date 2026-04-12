#!/usr/bin/env node
// Test the improved circuit detection with context

function extractOriginalPrompt(prompt) {
    const requestMatch = prompt.match(/Request:\s*(.+)$/s);
    if (requestMatch) {
        return requestMatch[1].trim();
    }
    return prompt;
}

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

// Test cases
const testCases = [
    // Simple prompt without context
    "Simple LED circuit with current limiting resistor",

    // Prompt with context (simulates what web interface does)
    `Context: The user is working on a basic electronics project for learning purposes. They want to start with simple circuits before moving to complex designs. Previous conversation included discussion about resistor values and LED forward voltages.

Request: Simple LED circuit with current limiting resistor`,

    // Complex prompt
    "USB-C connector with 5V and 3.3V regulators and ESP32 microcontroller"
];

console.log('🧪 Testing Improved Circuit Detection');
console.log('=' .repeat(50));

testCases.forEach((prompt, i) => {
    const original = extractOriginalPrompt(prompt);
    const isSimple = isSimpleCircuit(original);
    const mode = isSimple ? '🚀 FAST-PATH' : '🐌 FULL PIPELINE';

    console.log(`\nTest ${i + 1}: ${mode}`);
    console.log(`Full prompt length: ${prompt.length} chars`);
    console.log(`Original: "${original}"`);
    console.log(`Detection: ${isSimple ? 'SIMPLE' : 'COMPLEX'}`);
    console.log('-'.repeat(40));
});

console.log('\n✅ Fix should work! The web interface will now detect simple circuits correctly.');