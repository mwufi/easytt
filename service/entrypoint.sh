#!/bin/bash

# Start the Node.js server
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Keep the container running
wait $SERVER_PID