// Google Cloud Storage resumable upload adapter

export class GCSAdapter {
  constructor(options = {}) {
    this.bucket = options.bucket;
    this.projectId = options.projectId;
    this.credentials = options.credentials;
  }
  
  async initializeUpload(fileInfo) {
    const { filename, fileSize, fileHash, mimeType = 'application/octet-stream' } = fileInfo;
    
    try {
      const response = await fetch('/api/storage/gcs/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          fileSize,
          fileHash,
          mimeType,
          bucket: this.bucket,
          projectId: this.projectId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize GCS upload: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        uploadId: data.uploadId,
        resumableUrl: data.resumableUrl,
        objectName: data.objectName
      };
      
    } catch (error) {
      throw new Error(`GCS initialization failed: ${error.message}`);
    }
  }
  
  async uploadChunk(chunk, resumableUrl, startByte, totalSize, headers = {}) {
    try {
      const endByte = startByte + chunk.size - 1;
      
      const response = await fetch(resumableUrl, {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`,
          ...headers
        }
      });
      
      if (response.status === 308) {
        // Resume incomplete - check Range header for next byte
        const range = response.headers.get('Range');
        const nextByte = range ? parseInt(range.split('-')[1]) + 1 : startByte;
        
        return {
          success: false,
          needsResume: true,
          nextByte
        };
      }
      
      if (!response.ok) {
        throw new Error(`GCS chunk upload failed: ${response.status} ${response.statusText}`);
      }
      
      return {
        success: true,
        objectName: response.headers.get('X-GUploader-UploadID')
      };
      
    } catch (error) {
      throw new Error(`GCS chunk upload error: ${error.message}`);
    }
  }
  
  async finalizeUpload(uploadId, objectName) {
    try {
      const response = await fetch('/api/storage/gcs/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          objectName
        })
      });
      
      if (!response.ok) {
        throw new Error(`GCS finalization failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        success: true,
        finalUrl: data.mediaLink,
        objectName: data.name
      };
      
    } catch (error) {
      throw new Error(`GCS finalization error: ${error.message}`);
    }
  }
  
  async abortUpload(uploadId) {
    try {
      const response = await fetch('/api/storage/gcs/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      
      if (!response.ok) {
        throw new Error(`GCS abort failed: ${response.statusText}`);
      }
      
      return { success: true };
      
    } catch (error) {
      throw new Error(`GCS abort error: ${error.message}`);
    }
  }
}