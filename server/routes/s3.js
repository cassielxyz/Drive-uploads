import express from 'express';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const router = express.Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.AWS_S3_BUCKET;

// In-memory storage for multipart uploads (in production, use Redis or database)
const multipartUploads = new Map();

// Initialize S3 multipart upload
router.post('/initialize', async (req, res) => {
  try {
    const { filename, fileSize, fileHash, chunkCount, region, bucket } = req.body;
    
    if (!filename || !fileSize || !chunkCount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const bucketName = bucket || BUCKET_NAME;
    if (!bucketName) {
      return res.status(400).json({ error: 'S3 bucket not configured' });
    }
    
    // Generate unique key for the file
    const key = `uploads/${uuidv4()}/${filename}`;
    
    // Create multipart upload
    const multipartParams = {
      Bucket: bucketName,
      Key: key,
      ContentType: getContentType(filename),
      Metadata: {
        'original-filename': filename,
        'file-hash': fileHash || '',
        'upload-timestamp': new Date().toISOString()
      }
    };
    
    const multipartUpload = await s3.createMultipartUpload(multipartParams).promise();
    
    // Store multipart upload info
    const uploadInfo = {
      uploadId: multipartUpload.UploadId,
      bucket: bucketName,
      key,
      filename,
      fileSize,
      fileHash,
      chunkCount,
      parts: new Map(),
      createdAt: new Date().toISOString()
    };
    
    multipartUploads.set(multipartUpload.UploadId, uploadInfo);
    
    // Generate presigned URLs for each part
    const presignedUrls = [];
    for (let partNumber = 1; partNumber <= chunkCount; partNumber++) {
      const presignedUrl = await s3.getSignedUrlPromise('uploadPart', {
        Bucket: bucketName,
        Key: key,
        UploadId: multipartUpload.UploadId,
        PartNumber: partNumber
      });
      
      presignedUrls.push(presignedUrl);
    }
    
    logger.info('S3 multipart upload initialized', {
      uploadId: multipartUpload.UploadId,
      key,
      chunkCount
    });
    
    res.json({
      uploadId: multipartUpload.UploadId,
      presignedUrls,
      key
    });
    
  } catch (error) {
    logger.error('S3 initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize S3 upload' });
  }
});

// Upload a single part
router.put('/upload/:uploadId/:partNumber', async (req, res) => {
  try {
    const { uploadId, partNumber } = req.params;
    const partNumberInt = parseInt(partNumber);
    
    if (!uploadId || !partNumberInt) {
      return res.status(400).json({ error: 'Missing uploadId or partNumber' });
    }
    
    const uploadInfo = multipartUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Get presigned URL for this part
    const presignedUrl = await s3.getSignedUrlPromise('uploadPart', {
      Bucket: uploadInfo.bucket,
      Key: uploadInfo.key,
      UploadId: uploadId,
      PartNumber: partNumberInt
    });
    
    // Redirect to presigned URL for direct upload
    res.redirect(307, presignedUrl);
    
  } catch (error) {
    logger.error('S3 part upload error:', error);
    res.status(500).json({ error: 'Failed to upload part' });
  }
});

// Complete multipart upload
router.post('/finalize', async (req, res) => {
  try {
    const { uploadId, parts } = req.body;
    
    if (!uploadId || !parts || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'Missing uploadId or parts' });
    }
    
    const uploadInfo = multipartUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Complete multipart upload
    const completeParams = {
      Bucket: uploadInfo.bucket,
      Key: uploadInfo.key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map(part => ({
          ETag: part.ETag,
          PartNumber: part.PartNumber
        }))
      }
    };
    
    const result = await s3.completeMultipartUpload(completeParams).promise();
    
    // Clean up upload info
    multipartUploads.delete(uploadId);
    
    logger.info('S3 multipart upload completed', {
      uploadId,
      location: result.Location,
      key: uploadInfo.key
    });
    
    res.json({
      success: true,
      location: result.Location,
      key: uploadInfo.key,
      etag: result.ETag
    });
    
  } catch (error) {
    logger.error('S3 finalization error:', error);
    res.status(500).json({ error: 'Failed to finalize S3 upload' });
  }
});

// Abort multipart upload
router.post('/abort', async (req, res) => {
  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    
    const uploadInfo = multipartUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Abort multipart upload
    await s3.abortMultipartUpload({
      Bucket: uploadInfo.bucket,
      Key: uploadInfo.key,
      UploadId: uploadId
    }).promise();
    
    // Clean up upload info
    multipartUploads.delete(uploadId);
    
    logger.info('S3 multipart upload aborted', { uploadId });
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error('S3 abort error:', error);
    res.status(500).json({ error: 'Failed to abort S3 upload' });
  }
});

// List parts of a multipart upload
router.get('/parts/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const uploadInfo = multipartUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // List uploaded parts
    const listParams = {
      Bucket: uploadInfo.bucket,
      Key: uploadInfo.key,
      UploadId: uploadId
    };
    
    const result = await s3.listParts(listParams).promise();
    
    res.json({
      uploadId,
      parts: result.Parts || [],
      isTruncated: result.IsTruncated
    });
    
  } catch (error) {
    logger.error('S3 list parts error:', error);
    res.status(500).json({ error: 'Failed to list parts' });
  }
});

// Helper function to get content type based on file extension
function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'json': 'application/json',
    'xml': 'application/xml',
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

export default router;