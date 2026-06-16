#!/usr/bin/env bash
# start_all.sh – launch CHL Ollama server and the Ollama‑compatible shim
# ---------------------------------------------------------------
# Usage: ./start_all.sh
# The script runs the two npm commands in parallel and forwards
# SIGINT/SIGTERM to both child processes so they shut down cleanly.

set -e

# Start the CHL server (memory‑augmented LLM) in background
npm run serve:ollama &
CHL_PID=$!

echo "[info] CHL server started with PID $CHL_PID"

# Optional small pause to ensure the server is up
sleep 1

# Start the Ollama‑compatible shim (API) in background
npm run serve:ollama-api &
SHIM_PID=$!

echo "[info] Ollama shim started with PID $SHIM_PID"

# Cleanup function to stop both when the script ends or is interrupted
cleanup() {
  echo "[info] Stopping both processes..."
  kill $CHL_PID $SHIM_PID 2>/dev/null || true
}

trap cleanup SIGINT SIGTERM EXIT

# Wait for both background jobs (they will run until killed)
wait $CHL_PID $SHIM_PID
