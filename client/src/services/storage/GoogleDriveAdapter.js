// Google Drive resumable upload adapter

export class GoogleDriveAdapter {
  constructor(options = {}) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }
  
  async initializeUpload(fileInfo) {
    const { filename, fileSize, fileHash, mimeType = 'application/octet-stream' } = fileInfo;
    
    try {
      const response = await fetch('/api/storage/googledrive/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          fileSize,
          fileHash,
          mimeType
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize Google Drive upload: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        uploadId: data.uploadId,
        resumableUrl: data.resumableUrl,
        fileId: data.fileId
      };
      
    } catch (error) {
      throw new Error(`Google Drive initialization failed: ${error.message}`);
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
        throw new Error(`Google Drive chunk upload failed: ${response.status} ${response.statusText}`);
      }
      
      return {
        success: true,
        fileId: response.headers.get('X-GUploader-UploadID')
      };
      
    } catch (error) {
      throw new Error(`Google Drive chunk upload error: ${error.message}`);
    }
  }
  
  async finalizeUpload(uploadId, fileId) {
    try {
      const response = await fetch('/api/storage/googledrive/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Google Drive finalization failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        success: true,
        finalUrl: data.webViewLink,
        fileId: data.id
      };
      
    } catch (error) {
      throw new Error(`Google Drive finalization error: ${error.message}`);
    }
  }
  
  async abortUpload(uploadId) {
    try {
      const response = await fetch('/api/storage/googledrive/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      
      if (!response.ok) {
        throw new Error(`Google Drive abort failed: ${response.statusText}`);
      }
      
      return { success: true };
      
    } catch (error) {
      throw new Error(`Google Drive abort error: ${error.message}`);
    }
  }
  
  async refreshAccessToken() {
    try {
      const response = await fetch('/api/auth/googledrive/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: this.refreshToken,
          clientId: this.clientId,
          clientSecret: this.clientSecret
        })
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.accessToken = data.accessToken;
      
      return data.accessToken;
      
    } catch (error) {
      throw new Error(`Token refresh error: ${error.message}`);
    }
  }
}