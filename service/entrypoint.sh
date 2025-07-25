#!/bin/bash

# Start qBittorrent in daemon mode first
echo "Starting qBittorrent daemon..."
qbittorrent-nox -d --webui-port=8081 --profile=/home/appuser &
QBIT_PID=$!

# Wait a bit for qBittorrent to start
sleep 3

# Start the Node.js server
echo "Starting API server..."
node server.js &
SERVER_PID=$!

# Wait for both processes
wait $SERVER_PID