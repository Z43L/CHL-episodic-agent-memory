#!/usr/bin/env bash
# Smoke test rápido del MCP server via stdin/stdout
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' | CHL_PERSIST_PATH=/tmp/chl-mcp-smoke.log CHL_AUTO_REMEMBER=off node "$(dirname "$0")/../src/mcp-server.js" 2>/dev/null &
PID=$!
sleep 1
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true
rm -f /tmp/chl-mcp-smoke.log
echo "MCP smoke test OK"
