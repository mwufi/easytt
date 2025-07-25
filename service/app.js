import express from 'express';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

const execAsync = promisify(exec);
const s3 = new S3Client();
const BUCKET_NAME = process.env.S3_BUCKET;
const DOWNLOADS_DIR = '/downloads';
const SERVICE_VERSION = '1.0.2'; // Added health check endpoint

// Active torrents tracking
const activeTorrents = new Map();

// Health check endpoint (MUST be first for ALB)
app.get('/', (req, res) => {
  res.json({ status: 'healthy', version: SERVICE_VERSION });
});

// Ensure downloads directory exists
await fs.mkdir(DOWNLOADS_DIR, { recursive: true });

// Helper to upload file to S3
async function uploadToS3(filePath, s3Key) {
  console.log(`Uploading ${filePath} to s3://${BUCKET_NAME}/${s3Key}`);
  try {
    const fileStream = createReadStream(filePath);
    const stats = statSync(filePath);
    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
      ContentLength: stats.size
    }));
    
    console.log(`Successfully uploaded ${s3Key}`);
    return true;
  } catch (error) {
    console.error(`Failed to upload ${s3Key}:`, error);
    return false;
  }
}

// Monitor aria2c status
async function checkAria2Status() {
  try {
    const { stdout } = await execAsync('aria2c --show-files=true --dir=' + DOWNLOADS_DIR + ' --status-summary-interval=0');
    return stdout;
  } catch (error) {
    return null;
  }
}

// Scan downloads directory and upload completed files
async function scanAndUpload() {
  console.log('Scanning downloads directory...');
  try {
    const files = await fs.readdir(DOWNLOADS_DIR, { recursive: true });
    
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile()) {
        // Check if file is complete (not being written to)
        const size1 = stat.size;
        await new Promise(resolve => setTimeout(resolve, 1000));
        const stat2 = await fs.stat(filePath);
        
        if (size1 === stat2.size && size1 > 0) {
          // File is complete, upload it
          const uploaded = await uploadToS3(filePath, `torrents/${file}`);
          
          if (uploaded) {
            // Delete local file after successful upload
            await fs.unlink(filePath);
            console.log(`Deleted local file: ${file}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Scan error:', error);
  }
}

// Periodic scanning
setInterval(scanAndUpload, 30000); // Every 30 seconds

// Start a torrent download
app.post('/start', async (req, res) => {
  const { magnetLink } = req.body;
  
  if (!magnetLink) {
    return res.status(400).json({ error: 'magnetLink required' });
  }

  const torrentId = Date.now().toString();
  console.log(`Starting torrent ${torrentId}: ${magnetLink}`);
  
  // Use aria2c with proper options
  const aria2 = spawn('aria2c', [
    '--enable-dht=true',
    '--enable-dht6=true',
    '--listen-port=6881',
    '--dht-listen-port=6881',
    '--enable-peer-exchange=true',
    '--bt-tracker=udp://tracker.opentrackr.org:1337/announce,udp://open.tracker.cl:1337/announce,udp://tracker.openbittorrent.com:6969/announce,http://tracker.openbittorrent.com:80/announce,udp://tracker.torrent.eu.org:451/announce,udp://open.stealth.si:80/announce,udp://exodus.desync.com:6969/announce,udp://tracker.moeking.me:6969/announce',
    '--seed-time=0',
    '--max-connection-per-server=16',
    '--split=16',
    '--min-split-size=1M',
    '--disk-cache=64M',
    '--file-allocation=none',
    '--dir=' + DOWNLOADS_DIR,
    '--console-log-level=info',
    magnetLink
  ]);

  activeTorrents.set(torrentId, {
    magnetLink,
    status: 'downloading',
    startTime: new Date(),
    pid: aria2.pid,
    progress: 0
  });

  // Capture output
  aria2.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[aria2c ${torrentId}] ${output}`);
    
    // Parse progress
    const progressMatch = output.match(/\((\d+)%\)/);
    if (progressMatch) {
      const torrent = activeTorrents.get(torrentId);
      if (torrent) {
        torrent.progress = parseInt(progressMatch[1]);
      }
    }
  });

  aria2.stderr.on('data', (data) => {
    console.error(`[aria2c ${torrentId} ERROR] ${data}`);
  });

  aria2.on('exit', (code) => {
    console.log(`[aria2c ${torrentId}] Process exited with code ${code}`);
    const torrent = activeTorrents.get(torrentId);
    if (torrent) {
      torrent.status = code === 0 ? 'completed' : 'failed';
      torrent.exitCode = code;
    }
    
    // Trigger immediate scan after completion
    if (code === 0) {
      setTimeout(scanAndUpload, 5000);
    }
  });

  res.json({ torrentId, status: 'started' });
});

// Get status of all torrents
app.get('/status', async (req, res) => {
  const statuses = Array.from(activeTorrents.entries()).map(([id, torrent]) => ({
    id,
    magnetLink: torrent.magnetLink,
    status: torrent.status,
    progress: torrent.progress,
    startTime: torrent.startTime,
    pid: torrent.pid
  }));
  
  res.json(statuses);
});

// Get files from S3
app.get('/files', async (req, res) => {
  console.log('Listing S3 files...');
  try {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'torrents/',
      MaxKeys: 100
    }));
    
    const files = response.Contents?.map(file => ({
      name: file.Key,
      size: file.Size,
      lastModified: file.LastModified
    })) || [];
    
    console.log(`Found ${files.length} files in S3`);
    res.json(files);
  } catch (error) {
    console.error('S3 list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Version endpoint
app.get('/version', (req, res) => {
  res.json({
    version: SERVICE_VERSION,
    service: 'torrent-to-s3',
    features: [
      'aria2c torrent downloads',
      'automatic S3 uploads',
      'progress tracking',
      'debug endpoints'
    ]
  });
});

// Debug endpoint to check local files
app.get('/debug/local-files', async (req, res) => {
  try {
    const files = await fs.readdir(DOWNLOADS_DIR, { recursive: true });
    const fileDetails = [];
    
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile()) {
        fileDetails.push({
          name: file,
          size: stat.size,
          modified: stat.mtime
        });
      }
    }
    
    res.json({
      downloadDir: DOWNLOADS_DIR,
      files: fileDetails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Torrent API running on port ${PORT}`);
  console.log(`Using S3 bucket: ${BUCKET_NAME}`);
  console.log(`Downloads directory: ${DOWNLOADS_DIR}`);
  
  // Initial scan
  setTimeout(scanAndUpload, 5000);
});