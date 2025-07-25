#!/bin/bash
# This script is called by aria2c when download completes
# $3 = path to downloaded file

if [ -f "$3" ]; then
  # Upload to S3
  aws s3 cp "$3" "s3://$S3_BUCKET/torrents/$(basename "$3")"
  
  # Clean up local file after successful upload
  if [ $? -eq 0 ]; then
    rm -f "$3"
  fi
fi