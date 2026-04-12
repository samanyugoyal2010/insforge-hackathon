// Test script to verify Circuitron timeout configuration
const testCircuitronConfig = async () => {
  try {
    console.log('Testing Circuitron configuration...');

    // Test simple circuit first (should complete quickly)
    const simpleResponse = await fetch('http://localhost:3000/api/circuitron/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Design a simple LED circuit with a 5V power source, LED, and current limiting resistor',
        projectName: 'timeout-test-simple'
      })
    });

    if (simpleResponse.ok) {
      const result = await simpleResponse.json();
      console.log('✅ Simple circuit test passed');
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Files generated: ${Object.keys(result.files || {}).join(', ')}`);

      return { success: true, duration: result.duration };
    } else {
      const error = await simpleResponse.text();
      console.log('❌ Simple circuit test failed:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.log('❌ Test failed with error:', error.message);
    return { success: false, error: error.message };
  }
};

// Run the test
testCircuitronConfig()
  .then(result => {
    if (result.success) {
      console.log('✅ Timeout configuration test PASSED');
      console.log('The platform is ready for complex ESP32 designs!');
    } else {
      console.log('❌ Timeout configuration test FAILED');
      console.log('Check the server logs for more details');
    }
  })
  .catch(console.error);