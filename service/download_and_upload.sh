#!/bin/bash

# Download directory
DOWNLOAD_PATH="/mnt/data"

# Wait for downloads to complete by monitoring qBittorrent API
echo "Monitoring torrent downloads..."

# Check download status every 30 seconds
while true; do
    # Get torrent info from qBittorrent API
    TORRENT_INFO=$(curl -s http://localhost:8081/api/v2/torrents/info)
    
    # Check if all torrents are completed (state: "completed" or "seeding")
    COMPLETED=$(echo "$TORRENT_INFO" | grep -E '"state":\s*"(completed|seeding)"' | wc -l)
    TOTAL=$(echo "$TORRENT_INFO" | grep -c '"state"')
    
    if [ "$TOTAL" -gt 0 ] && [ "$COMPLETED" -eq "$TOTAL" ]; then
        echo "All torrents completed. Starting upload to S3..."
        break
    fi
    
    echo "Download in progress: $COMPLETED/$TOTAL completed"
    sleep 30
done

# Upload completed files to S3
echo "Uploading files to S3 bucket: $S3_BUCKET"
aws s3 cp $DOWNLOAD_PATH s3://$S3_BUCKET/ --recursive --sse AES256

echo "Upload completed!"
exit 0