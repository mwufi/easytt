const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');

const app = express();
const PORT = 8080;

// AWS S3 client
const s3 = new AWS.S3();

// Store for download progress
let downloadProgress = {
  status: 'idle',
  progress: 0,
  downloaded: 0,
  total: 0,
  uploadedFiles: [],
  error: null
};

// Start torrent download in background
const startTorrentDownload = () => {
  downloadProgress.status = 'downloading';
  
  exec('./download_and_upload.sh', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      downloadProgress.status = 'error';
      downloadProgress.error = error.message;
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
    downloadProgress.status = 'completed';
    downloadProgress.progress = 100;
  });
};

// Monitor torrent progress by checking qBittorrent logs
const monitorProgress = async () => {
  try {
    // Check if qBittorrent state file exists
    const stateFile = '/home/.config/qBittorrent/logs/qbittorrent.log';
    const exists = await fs.access(stateFile).then(() => true).catch(() => false);
    
    if (exists) {
      const log = await fs.readFile(stateFile, 'utf8');
      // Parse progress from logs (this is a simplified example)
      const progressMatch = log.match(/Progress: (\d+)%/);
      if (progressMatch) {
        downloadProgress.progress = parseInt(progressMatch[1]);
      }
    }
  } catch (error) {
    console.error('Error monitoring progress:', error);
  }
};

// Start monitoring
setInterval(monitorProgress, 5000);

// Homepage
app.get('/', (req, res) => {
  res.json({
    service: 'Torrent Downloader',
    endpoints: {
      '/': 'Service information',
      '/status': 'Download status and progress',
      '/start': 'Start torrent download',
      '/files': 'List uploaded files'
    }
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json(downloadProgress);
});

// Start download endpoint
app.post('/start', (req, res) => {
  if (downloadProgress.status === 'idle' || downloadProgress.status === 'error') {
    startTorrentDownload();
    res.json({ message: 'Download started', status: downloadProgress.status });
  } else {
    res.status(400).json({ 
      message: 'Download already in progress', 
      status: downloadProgress.status 
    });
  }
});

// List uploaded files
app.get('/files', async (req, res) => {
  try {
    const bucketName = process.env.S3_BUCKET;
    if (!bucketName) {
      return res.status(500).json({ error: 'S3_BUCKET not configured' });
    }

    const params = {
      Bucket: bucketName,
      MaxKeys: 100
    };

    const data = await s3.listObjectsV2(params).promise();
    const files = data.Contents.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    }));

    res.json({ bucket: bucketName, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Auto-start download on container start
  if (process.env.AUTO_START === 'true') {
    startTorrentDownload();
  }
});