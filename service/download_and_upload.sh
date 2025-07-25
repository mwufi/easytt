#!/bin/bash

# Download directory
DOWNLOAD_PATH="/mnt/data"

# Create download directory (should already exist from Dockerfile)
mkdir -p $DOWNLOAD_PATH 2>/dev/null || true

# Set qBittorrent config directory
export QBT_PROFILE=/home/appuser

# Download torrent using qbittorrent-nox
qbittorrent-nox "$MAGNET_LINK" --save-path=$DOWNLOAD_PATH --profile=$QBT_PROFILE

# Wait for download to complete (simplified; use qBittorrent API for robust monitoring)
while pgrep qbittorrent-nox > /dev/null; do
    sleep 60
done

# Upload to S3
aws s3 cp $DOWNLOAD_PATH s3://$S3_BUCKET/ --recursive --sse AES256

# Exit
exit 0