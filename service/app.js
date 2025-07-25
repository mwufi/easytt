import express from 'express';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

const app = express();
app.use(express.json());

const s3 = new S3Client();
const BUCKET_NAME = process.env.S3_BUCKET;
const DOWNLOADS_DIR = '/downloads';

// Active torrents tracking
const activeTorrents = new Map();

// Ensure downloads directory exists
await fs.mkdir(DOWNLOADS_DIR, { recursive: true });

// Start a torrent download
app.post('/start', async (req, res) => {
  const { magnetLink } = req.body;
  
  if (!magnetLink) {
    return res.status(400).json({ error: 'magnetLink required' });
  }

  const torrentId = Date.now().toString();
  
  // Use aria2c for downloading (lightweight and reliable)
  const aria2 = spawn('aria2c', [
    '--seed-time=0',
    '--dir=' + DOWNLOADS_DIR,
    '--on-download-complete=/app/upload-to-s3.sh',
    magnetLink
  ]);

  activeTorrents.set(torrentId, {
    magnetLink,
    status: 'downloading',
    startTime: new Date(),
    pid: aria2.pid
  });

  aria2.on('exit', (code) => {
    const torrent = activeTorrents.get(torrentId);
    if (torrent) {
      torrent.status = code === 0 ? 'completed' : 'failed';
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
    startTime: torrent.startTime
  }));
  
  res.json(statuses);
});

// Get files from S3
app.get('/files', async (req, res) => {
  try {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 100
    }));
    
    const files = response.Contents?.map(file => ({
      name: file.Key,
      size: file.Size,
      lastModified: file.LastModified
    })) || [];
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Torrent API running on port ${PORT}`);
});