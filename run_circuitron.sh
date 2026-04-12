#!/bin/bash

# Circuitron Setup and Usage Script
# This script helps you run Circuitron with the proper environment

echo "=== Circuitron Quick Start ==="
echo

# Check if API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY is not set"
    echo "Please set your OpenAI API key:"
    echo "export OPENAI_API_KEY='your-api-key-here'"
    echo
    echo "You can get an API key from: https://platform.openai.com/account/api-keys"
    echo
    exit 1
fi

echo "✅ OpenAI API key is set"

# Create output directory
mkdir -p circuitron_output
echo "✅ Output directory created: ./circuitron_output"

# Check if MCP server is available
echo "🔍 Checking MCP server..."
if [ -z "$MCP_URL" ]; then
    echo "⚠️  No MCP_URL set - running in fallback mode (basic SKiDL knowledge only)"
    echo "   For full capabilities, set up the MCP server (see SETUP.md)"
    echo

    # Run in fallback mode
    echo "🚀 Starting Circuitron in fallback mode..."
    CIRCUITRON_SKIP_MCP_CHECK=1 circuitron --output-dir ./circuitron_output --keep-skidl "$@"
else
    echo "✅ MCP server configured"
    echo "🚀 Starting Circuitron with full MCP capabilities..."
    circuitron --output-dir ./circuitron_output --keep-skidl "$@"
fi