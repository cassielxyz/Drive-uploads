import express from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const router = express.Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
  // Or use service account key directly
  credentials: process.env.GOOGLE_CLOUD_CREDENTIALS ? 
    JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) : undefined
});

const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET;

// In-memory storage for GCS uploads (in production, use Redis or database)
const gcsUploads = new Map();

// Initialize GCS resumable upload
router.post('/initialize', async (req, res) => {
  try {
    const { filename, fileSize, fileHash, mimeType, bucket, projectId } = req.body;
    
    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const bucketName = bucket || BUCKET_NAME;
    if (!bucketName) {
      return res.status(400).json({ error: 'GCS bucket not configured' });
    }
    
    // Generate unique object name
    const objectName = `uploads/${uuidv4()}/${filename}`;
    
    // Get bucket reference
    const bucketRef = storage.bucket(bucketName);
    const file = bucketRef.file(objectName);
    
    // Generate resumable upload URL
    const resumableUrl = await generateResumableUploadUrl(file, mimeType || 'application/octet-stream');
    
    // Store upload info
    const uploadInfo = {
      uploadId: uuidv4(),
      bucket: bucketName,
      objectName,
      filename,
      fileSize,
      fileHash,
      mimeType: mimeType || 'application/octet-stream',
      resumableUrl,
      uploadedBytes: 0,
      createdAt: new Date().toISOString()
    };
    
    gcsUploads.set(uploadInfo.uploadId, uploadInfo);
    
    logger.info('GCS upload initialized', {
      uploadId: uploadInfo.uploadId,
      objectName,
      bucket: bucketName
    });
    
    res.json({
      uploadId: uploadInfo.uploadId,
      resumableUrl,
      objectName
    });
    
  } catch (error) {
    logger.error('GCS initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize GCS upload' });
  }
});

// Upload chunk to GCS
router.put('/upload/:uploadId/:chunkIndex', async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.params;
    const chunkIndexInt = parseInt(chunkIndex);
    
    if (!uploadId || isNaN(chunkIndexInt)) {
      return res.status(400).json({ error: 'Missing uploadId or invalid chunkIndex' });
    }
    
    const uploadInfo = gcsUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Get the resumable URL for this upload
    res.redirect(307, uploadInfo.resumableUrl);
    
  } catch (error) {
    logger.error('GCS chunk upload error:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// Complete GCS upload
router.post('/finalize', async (req, res) => {
  try {
    const { uploadId, objectName } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    
    const uploadInfo = gcsUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Get bucket and file references
    const bucket = storage.bucket(uploadInfo.bucket);
    const file = bucket.file(uploadInfo.objectName);
    
    // Get file metadata
    const [metadata] = await file.getMetadata();
    
    // Generate public URL (if bucket is public) or signed URL
    let publicUrl;
    try {
      publicUrl = `https://storage.googleapis.com/${uploadInfo.bucket}/${uploadInfo.objectName}`;
      
      // Test if file is publicly accessible
      await file.makePublic();
    } catch (error) {
      // Generate signed URL for private files
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });
      publicUrl = signedUrl;
    }
    
    // Clean up upload info
    gcsUploads.delete(uploadId);
    
    logger.info('GCS upload completed', {
      uploadId,
      objectName: uploadInfo.objectName,
      bucket: uploadInfo.bucket
    });
    
    res.json({
      success: true,
      name: metadata.name,
      bucket: metadata.bucket,
      size: metadata.size,
      mediaLink: metadata.mediaLink,
      publicUrl
    });
    
  } catch (error) {
    logger.error('GCS finalization error:', error);
    res.status(500).json({ error: 'Failed to finalize GCS upload' });
  }
});

// Abort GCS upload
router.post('/abort', async (req, res) => {
  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    
    const uploadInfo = gcsUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Get bucket and file references
    const bucket = storage.bucket(uploadInfo.bucket);
    const file = bucket.file(uploadInfo.objectName);
    
    // Delete the file if it exists
    try {
      await file.delete();
    } catch (deleteError) {
      // File might not exist or already deleted
      logger.warn('Could not delete file during abort:', deleteError.message);
    }
    
    // Clean up upload info
    gcsUploads.delete(uploadId);
    
    logger.info('GCS upload aborted', { uploadId });
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error('GCS abort error:', error);
    res.status(500).json({ error: 'Failed to abort GCS upload' });
  }
});

// Get upload status
router.get('/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const uploadInfo = gcsUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    res.json({
      uploadId,
      objectName: uploadInfo.objectName,
      bucket: uploadInfo.bucket,
      filename: uploadInfo.filename,
      fileSize: uploadInfo.fileSize,
      uploadedBytes: uploadInfo.uploadedBytes,
      progress: (uploadInfo.uploadedBytes / uploadInfo.fileSize) * 100,
      resumableUrl: uploadInfo.resumableUrl
    });
    
  } catch (error) {
    logger.error('GCS status error:', error);
    res.status(500).json({ error: 'Failed to get upload status' });
  }
});

// Helper function to generate resumable upload URL
async function generateResumableUploadUrl(file, mimeType) {
  try {
    const options = {
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000'
      },
      resumable: true
    };
    
    // Create resumable upload session
    const [resumableUrl] = await file.createResumableUpload(options);
    
    if (!resumableUrl) {
      throw new Error('No resumable URL returned from GCS');
    }
    
    return resumableUrl;
    
  } catch (error) {
    logger.error('Error generating resumable URL:', error);
    throw error;
  }
}

export default router;