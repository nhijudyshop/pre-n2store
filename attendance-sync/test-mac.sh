#!/bin/bash
# Test DG-600 connection from macOS
# Usage:
#   ./test-mac.sh              (test with CommKey=0)
#   ./test-mac.sh debug        (show raw hex bytes)
#   ./test-mac.sh debug key 5  (try CommKey=5 with debug)
#   ./test-mac.sh find         (auto-find CommKey)

cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install: brew install node"
  exit 1
fi

# Check dependencies
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "============================================"
echo " DG-600 Test (macOS)"
echo " Device: 192.168.1.201:4370"
echo "============================================"
echo ""

# Check network connectivity first
echo "Ping test..."
if ping -c 1 -W 2 192.168.1.201 > /dev/null 2>&1; then
  echo "  OK - device is reachable"
else
  echo "  FAIL - cannot reach 192.168.1.201"
  echo ""
  echo "  Make sure:"
  echo "    1. Mac and device are on the same network"
  echo "    2. Device IP is 192.168.1.201"
  echo "    3. Try: ping 192.168.1.201"
  exit 1
fi
echo ""

if [ "$1" = "find" ]; then
  echo "Finding CommKey..."
  echo ""
  node find-commkey.js "${@:2}"
else
  node test.js "$@"
fi
