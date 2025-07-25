#!/bin/bash

# Download directory
DOWNLOAD_PATH="/mnt/data"

# Create download directory
mkdir -p $DOWNLOAD_PATH

# Download torrent using qbittorrent-nox
qbittorrent-nox -d "$MAGNET_LINK" --save-path $DOWNLOAD_PATH

# Wait for download to complete (simplified; use qBittorrent API for robust monitoring)
while pgrep qbittorrent-nox > /dev/null; do
    sleep 60
done

# Upload to S3
aws s3 cp $DOWNLOAD_PATH s3://$S3_BUCKET/ --recursive --sse AES256

# Exit
exit 0