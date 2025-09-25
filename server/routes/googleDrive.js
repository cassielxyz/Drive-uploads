import express from 'express';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const router = express.Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// In-memory storage for Google Drive uploads (in production, use Redis or database)
const driveUploads = new Map();

// Initialize Google Drive resumable upload
router.post('/initialize', async (req, res) => {
  try {
    const { filename, fileSize, fileHash, mimeType } = req.body;
    
    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    // Set credentials (in production, get from user's stored tokens)
    oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Create file metadata
    const fileMetadata = {
      name: filename,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root']
    };
    
    // Create the file
    const file = await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: '' // Empty body for resumable upload
      },
      fields: 'id'
    });
    
    const fileId = file.data.id;
    
    // Generate resumable upload URL
    const resumableUrl = await generateResumableUploadUrl(drive, fileId, mimeType || 'application/octet-stream');
    
    // Store upload info
    const uploadInfo = {
      uploadId: uuidv4(),
      fileId,
      filename,
      fileSize,
      fileHash,
      mimeType: mimeType || 'application/octet-stream',
      resumableUrl,
      uploadedBytes: 0,
      createdAt: new Date().toISOString()
    };
    
    driveUploads.set(uploadInfo.uploadId, uploadInfo);
    
    logger.info('Google Drive upload initialized', {
      uploadId: uploadInfo.uploadId,
      fileId,
      filename
    });
    
    res.json({
      uploadId: uploadInfo.uploadId,
      resumableUrl,
      fileId
    });
    
  } catch (error) {
    logger.error('Google Drive initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize Google Drive upload' });
  }
});

// Upload chunk to Google Drive
router.put('/upload/:uploadId/:chunkIndex', async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.params;
    const chunkIndexInt = parseInt(chunkIndex);
    
    if (!uploadId || isNaN(chunkIndexInt)) {
      return res.status(400).json({ error: 'Missing uploadId or invalid chunkIndex' });
    }
    
    const uploadInfo = driveUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Get the resumable URL for this upload
    res.redirect(307, uploadInfo.resumableUrl);
    
  } catch (error) {
    logger.error('Google Drive chunk upload error:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// Complete Google Drive upload
router.post('/finalize', async (req, res) => {
  try {
    const { uploadId, fileId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    
    const uploadInfo = driveUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Get file details
    const file = await drive.files.get({
      fileId: uploadInfo.fileId,
      fields: 'id,name,size,webViewLink,webContentLink'
    });
    
    // Clean up upload info
    driveUploads.delete(uploadId);
    
    logger.info('Google Drive upload completed', {
      uploadId,
      fileId: uploadInfo.fileId,
      filename: uploadInfo.filename
    });
    
    res.json({
      success: true,
      id: file.data.id,
      name: file.data.name,
      size: file.data.size,
      webViewLink: file.data.webViewLink,
      webContentLink: file.data.webContentLink
    });
    
  } catch (error) {
    logger.error('Google Drive finalization error:', error);
    res.status(500).json({ error: 'Failed to finalize Google Drive upload' });
  }
});

// Abort Google Drive upload
router.post('/abort', async (req, res) => {
  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    
    const uploadInfo = driveUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Delete the file if it exists
    try {
      await drive.files.delete({
        fileId: uploadInfo.fileId
      });
    } catch (deleteError) {
      // File might not exist or already deleted
      logger.warn('Could not delete file during abort:', deleteError.message);
    }
    
    // Clean up upload info
    driveUploads.delete(uploadId);
    
    logger.info('Google Drive upload aborted', { uploadId });
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error('Google Drive abort error:', error);
    res.status(500).json({ error: 'Failed to abort Google Drive upload' });
  }
});

// Get upload status
router.get('/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const uploadInfo = driveUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    res.json({
      uploadId,
      fileId: uploadInfo.fileId,
      filename: uploadInfo.filename,
      fileSize: uploadInfo.fileSize,
      uploadedBytes: uploadInfo.uploadedBytes,
      progress: (uploadInfo.uploadedBytes / uploadInfo.fileSize) * 100,
      resumableUrl: uploadInfo.resumableUrl
    });
    
  } catch (error) {
    logger.error('Google Drive status error:', error);
    res.status(500).json({ error: 'Failed to get upload status' });
  }
});

// Helper function to generate resumable upload URL
async function generateResumableUploadUrl(drive, fileId, mimeType) {
  try {
    const response = await drive.files.update({
      fileId: fileId,
      media: {
        mimeType: mimeType,
        body: '' // Empty body to get resumable URL
      },
      uploadType: 'resumable'
    });
    
    // Extract resumable URL from response headers
    const resumableUrl = response.headers.location;
    if (!resumableUrl) {
      throw new Error('No resumable URL returned from Google Drive');
    }
    
    return resumableUrl;
    
  } catch (error) {
    logger.error('Error generating resumable URL:', error);
    throw error;
  }
}

export default router;