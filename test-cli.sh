#!/bin/bash

# Quick CLI testing script

echo "🧪 Testing TeamDay CLI"
echo "====================="
echo

# Test help
echo "1. Testing help command..."
bun run bin/teamday.ts --help
echo

# Test auth status
echo "2. Testing auth status..."
bun run bin/teamday.ts auth status
echo

# Test config
echo "3. Testing config..."
bun run bin/teamday.ts config list
echo

echo "✅ Basic tests complete!"
echo
echo "To test OAuth flow:"
echo "  bun run bin/teamday.ts auth login"
echo
