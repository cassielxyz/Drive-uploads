// AWS S3 multipart upload adapter

export class S3Adapter {
  constructor(options = {}) {
    this.region = options.region || 'us-east-1';
    this.bucket = options.bucket;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
  }
  
  async initializeUpload(fileInfo) {
    const { filename, fileSize, fileHash, chunkCount } = fileInfo;
    
    try {
      const response = await fetch('/api/storage/s3/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          fileSize,
          fileHash,
          chunkCount,
          region: this.region,
          bucket: this.bucket
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize S3 upload: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        uploadId: data.uploadId,
        chunkUrls: data.presignedUrls,
        key: data.key
      };
      
    } catch (error) {
      throw new Error(`S3 initialization failed: ${error.message}`);
    }
  }
  
  async uploadChunk(chunk, uploadUrl, headers = {}) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`S3 chunk upload failed: ${response.status} ${response.statusText}`);
      }
      
      // Extract ETag from response headers
      const etag = response.headers.get('ETag');
      if (!etag) {
        throw new Error('Missing ETag in S3 response');
      }
      
      return {
        success: true,
        etag: etag.replace(/"/g, ''), // Remove quotes from ETag
        partNumber: headers['X-Part-Number'] || 1
      };
      
    } catch (error) {
      throw new Error(`S3 chunk upload error: ${error.message}`);
    }
  }
  
  async finalizeUpload(uploadId, parts) {
    try {
      const response = await fetch('/api/storage/s3/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          parts: parts.map((part, index) => ({
            ETag: part.etag,
            PartNumber: index + 1
          }))
        })
      });
      
      if (!response.ok) {
        throw new Error(`S3 finalization failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        success: true,
        finalUrl: data.location,
        key: data.key
      };
      
    } catch (error) {
      throw new Error(`S3 finalization error: ${error.message}`);
    }
  }
  
  async abortUpload(uploadId) {
    try {
      const response = await fetch('/api/storage/s3/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      
      if (!response.ok) {
        throw new Error(`S3 abort failed: ${response.statusText}`);
      }
      
      return { success: true };
      
    } catch (error) {
      throw new Error(`S3 abort error: ${error.message}`);
    }
  }
}