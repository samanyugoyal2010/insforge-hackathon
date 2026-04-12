#!/bin/bash
# Test the skip-planning flag directly

echo "🧪 Testing --skip-planning flag directly..."
echo "=================================="

cd circuitron-integration/circuitron-integration || exit 1

# Create a temp directory for output
temp_dir=$(mktemp -d)
echo "📁 Output directory: $temp_dir"

echo ""
echo "🚀 Running with --skip-planning flag..."
echo "Command: python -m circuitron --skip-planning --output-dir $temp_dir 'Simple LED circuit'"
echo ""

timeout 120s python -m circuitron --skip-planning --output-dir "$temp_dir" "Simple LED circuit"

exit_code=$?
echo ""
echo "Exit code: $exit_code"
echo ""

if [ $exit_code -eq 124 ]; then
    echo "⏱️  TIMEOUT: Test took more than 2 minutes (should be fast!)"
elif [ $exit_code -eq 0 ]; then
    echo "✅ SUCCESS: Command completed"
    echo "📁 Files generated:"
    ls -la "$temp_dir" 2>/dev/null || echo "No files found"
else
    echo "❌ FAILED: Command failed with exit code $exit_code"
fi

# Cleanup
rm -rf "$temp_dir"