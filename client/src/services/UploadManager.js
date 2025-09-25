// Core upload manager for handling chunked, resumable uploads

import { 
  UPLOAD_STATUS, 
  generateChunkMetadata, 
  calculateOptimalChunkSize,
  getRetryConfig 
} from '../utils/uploadUtils.js';
import { NetworkDiagnostics } from '../utils/uploadUtils.js';

export class UploadManager {
  constructor(options = {}) {
    this.options = {
      chunkSize: 1024 * 1024, // 1MB default
      concurrency: 3,
      autoTune: true,
      ...options
    };
    
    this.uploads = new Map();
    this.networkDiagnostics = new NetworkDiagnostics();
    this.workers = {
      hash: new Worker('/src/workers/hashWorker.js'),
      upload: new Worker('/src/workers/uploadWorker.js')
    };
    
    this.setupWorkerListeners();
  }
  
  setupWorkerListeners() {
    // Hash worker listeners
    this.workers.hash.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'HASH_COMPLETE':
          this.handleFileHashComplete(data);
          break;
        case 'CHUNK_HASH_COMPLETE':
          this.handleChunkHashComplete(data);
          break;
        case 'HASH_ERROR':
          this.handleHashError(data);
          break;
      }
    };
    
    // Upload worker listeners
    this.workers.upload.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'CHUNK_UPLOAD_COMPLETE':
          this.handleChunkUploadComplete(data);
          break;
        case 'CHUNK_UPLOAD_ERROR':
          this.handleChunkUploadError(data);
          break;
      }
    };
  }
  
  async createUpload(file, storageType, options = {}) {
    const uploadId = this.generateUploadId();
    const upload = {
      id: uploadId,
      file,
      storageType,
      status: UPLOAD_STATUS.PENDING,
      progress: 0,
      speed: 0,
      eta: 'Calculating...',
      chunks: [],
      completedChunks: new Set(),
      failedChunks: new Set(),
      startTime: null,
      endTime: null,
      error: null,
      options: { ...this.options, ...options }
    };
    
    // Calculate chunks
    this.calculateChunks(upload);
    
    // Start file hashing
    this.workers.hash.postMessage({
      type: 'HASH_FILE',
      data: { file, algorithm: 'SHA-256' }
    });
    
    this.uploads.set(uploadId, upload);
    return upload;
  }
  
  calculateChunks(upload) {
    const { file, options } = upload;
    const chunkSize = options.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    upload.chunks = Array.from({ length: totalChunks }, (_, index) => {
      const metadata = generateChunkMetadata(file, chunkSize, index);
      return {
        ...metadata,
        status: UPLOAD_STATUS.PENDING,
        hash: null,
        uploadUrl: null,
        retryCount: 0
      };
    });
  }
  
  async startUpload(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error('Upload not found');
    
    upload.status = UPLOAD_STATUS.UPLOADING;
    upload.startTime = Date.now();
    
    // Get presigned URLs for all chunks
    await this.initializeChunkUploads(upload);
    
    // Start uploading chunks with concurrency control
    this.uploadChunksWithConcurrency(upload);
  }
  
  async initializeChunkUploads(upload) {
    const { file, storageType, chunks } = upload;
    
    try {
      const response = await fetch('/api/upload/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          fileHash: upload.fileHash,
          chunkCount: chunks.length,
          storageType,
          options: upload.options
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize upload: ${response.statusText}`);
      }
      
      const data = await response.json();
      upload.uploadId = data.uploadId;
      upload.chunkUrls = data.chunkUrls;
      
      // Assign URLs to chunks
      chunks.forEach((chunk, index) => {
        chunk.uploadUrl = data.chunkUrls[index];
      });
      
    } catch (error) {
      upload.status = UPLOAD_STATUS.FAILED;
      upload.error = error.message;
      throw error;
    }
  }
  
  async uploadChunksWithConcurrency(upload) {
    const { chunks, options } = upload;
    const concurrency = options.concurrency;
    const pendingChunks = chunks.filter(chunk => 
      chunk.status === UPLOAD_STATUS.PENDING && 
      !upload.completedChunks.has(chunk.chunkIndex)
    );
    
    const semaphore = new Semaphore(concurrency);
    
    for (const chunk of pendingChunks) {
      semaphore.acquire().then(() => {
        this.uploadChunk(upload, chunk);
      });
    }
  }
  
  async uploadChunk(upload, chunk) {
    try {
      chunk.status = UPLOAD_STATUS.UPLOADING;
      
      // Calculate chunk hash if not already done
      if (!chunk.hash) {
        this.workers.hash.postMessage({
          type: 'HASH_CHUNK',
          data: { 
            chunk: chunk.chunk, 
            chunkIndex: chunk.chunkIndex,
            algorithm: 'SHA-256'
          }
        });
        
        // Wait for hash before uploading
        await new Promise((resolve, reject) => {
          const handler = (e) => {
            if (e.data.type === 'CHUNK_HASH_COMPLETE' && e.data.data.chunkIndex === chunk.chunkIndex) {
              chunk.hash = e.data.data.hash;
              this.workers.hash.removeEventListener('message', handler);
              resolve();
            } else if (e.data.type === 'CHUNK_HASH_ERROR' && e.data.data.chunkIndex === chunk.chunkIndex) {
              this.workers.hash.removeEventListener('message', handler);
              reject(new Error(e.data.data.error));
            }
          };
          this.workers.hash.addEventListener('message', handler);
        });
      }
      
      // Upload chunk
      this.workers.upload.postMessage({
        type: 'UPLOAD_CHUNK',
        data: {
          chunk: chunk.chunk,
          uploadUrl: chunk.uploadUrl,
          chunkIndex: chunk.chunkIndex,
          headers: {
            'Content-Range': `bytes ${chunk.start}-${chunk.end - 1}/${upload.file.size}`,
            'X-Chunk-Hash': chunk.hash
          }
        }
      });
      
    } catch (error) {
      this.handleChunkUploadError({
        error: error.message,
        chunkIndex: chunk.chunkIndex,
        retryable: true
      });
    }
  }
  
  handleChunkUploadComplete(data) {
    const { chunkIndex } = data;
    const upload = this.findUploadByChunkIndex(chunkIndex);
    if (!upload) return;
    
    const chunk = upload.chunks[chunkIndex];
    chunk.status = UPLOAD_STATUS.COMPLETED;
    upload.completedChunks.add(chunkIndex);
    
    this.updateUploadProgress(upload);
    this.checkUploadCompletion(upload);
  }
  
  handleChunkUploadError(data) {
    const { chunkIndex, error, retryable } = data;
    const upload = this.findUploadByChunkIndex(chunkIndex);
    if (!upload) return;
    
    const chunk = upload.chunks[chunkIndex];
    chunk.retryCount++;
    
    if (retryable && chunk.retryCount < 3) {
      // Retry chunk
      setTimeout(() => {
        this.uploadChunk(upload, chunk);
      }, getRetryConfig(chunk.retryCount).delay);
    } else {
      // Mark chunk as failed
      chunk.status = UPLOAD_STATUS.FAILED;
      upload.failedChunks.add(chunkIndex);
      
      if (upload.failedChunks.size > upload.chunks.length * 0.1) {
        // Too many failures, mark entire upload as failed
        upload.status = UPLOAD_STATUS.FAILED;
        upload.error = `Too many chunk failures: ${upload.failedChunks.size}/${upload.chunks.length}`;
      }
    }
    
    this.updateUploadProgress(upload);
  }
  
  handleFileHashComplete(data) {
    const { hash } = data;
    // Find upload by checking which one doesn't have a hash yet
    for (const upload of this.uploads.values()) {
      if (!upload.fileHash) {
        upload.fileHash = hash;
        break;
      }
    }
  }
  
  handleChunkHashComplete(data) {
    const { hash, chunkIndex } = data;
    const upload = this.findUploadByChunkIndex(chunkIndex);
    if (upload) {
      upload.chunks[chunkIndex].hash = hash;
    }
  }
  
  handleHashError(data) {
    console.error('Hash calculation error:', data.error);
  }
  
  updateUploadProgress(upload) {
    const completedBytes = Array.from(upload.completedChunks)
      .reduce((sum, chunkIndex) => sum + upload.chunks[chunkIndex].size, 0);
    
    upload.progress = (completedBytes / upload.file.size) * 100;
    
    // Calculate speed and ETA
    if (upload.startTime) {
      const elapsed = (Date.now() - upload.startTime) / 1000;
      upload.speed = completedBytes / elapsed;
      upload.eta = this.calculateETA(completedBytes, upload.file.size, upload.speed);
    }
    
    // Update network diagnostics
    this.networkDiagnostics.addSample(upload.speed, 0); // Latency would need to be measured separately
    
    // Auto-tune chunk size if enabled
    if (upload.options.autoTune && upload.completedChunks.size > 5) {
      this.autoTuneChunkSize(upload);
    }
  }
  
  checkUploadCompletion(upload) {
    if (upload.completedChunks.size === upload.chunks.length) {
      upload.status = UPLOAD_STATUS.COMPLETED;
      upload.endTime = Date.now();
      this.finalizeUpload(upload);
    }
  }
  
  async finalizeUpload(upload) {
    try {
      const response = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: upload.uploadId,
          storageType: upload.storageType
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to finalize upload: ${response.statusText}`);
      }
      
      const data = await response.json();
      upload.finalUrl = data.finalUrl;
      
    } catch (error) {
      upload.status = UPLOAD_STATUS.FAILED;
      upload.error = error.message;
    }
  }
  
  autoTuneChunkSize(upload) {
    const avgSpeed = this.networkDiagnostics.getAverageSpeed();
    const stability = this.networkDiagnostics.getNetworkStability();
    
    if (avgSpeed > 0 && stability > 0.7) {
      const optimalSize = calculateOptimalChunkSize(avgSpeed, 0, upload.file.size);
      
      if (Math.abs(optimalSize - upload.options.chunkSize) > upload.options.chunkSize * 0.5) {
        upload.options.chunkSize = optimalSize;
        // Recalculate chunks for remaining uploads
        this.calculateChunks(upload);
      }
    }
  }
  
  calculateETA(bytesUploaded, totalBytes, speed) {
    if (speed === 0) return 'Calculating...';
    
    const remainingBytes = totalBytes - bytesUploaded;
    const secondsRemaining = remainingBytes / speed;
    
    if (secondsRemaining < 60) {
      return `${Math.round(secondsRemaining)}s`;
    } else if (secondsRemaining < 3600) {
      return `${Math.round(secondsRemaining / 60)}m`;
    } else {
      return `${Math.round(secondsRemaining / 3600)}h`;
    }
  }
  
  findUploadByChunkIndex(chunkIndex) {
    for (const upload of this.uploads.values()) {
      if (upload.chunks[chunkIndex]) {
        return upload;
      }
    }
    return null;
  }
  
  generateUploadId() {
    return 'upload_' + Math.random().toString(36).substr(2, 9);
  }
  
  pauseUpload(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.status = UPLOAD_STATUS.PAUSED;
    }
  }
  
  resumeUpload(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (upload && upload.status === UPLOAD_STATUS.PAUSED) {
      upload.status = UPLOAD_STATUS.UPLOADING;
      this.uploadChunksWithConcurrency(upload);
    }
  }
  
  cancelUpload(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.status = UPLOAD_STATUS.CANCELLED;
      // TODO: Cancel in-flight requests
    }
  }
  
  getUpload(uploadId) {
    return this.uploads.get(uploadId);
  }
  
  getAllUploads() {
    return Array.from(this.uploads.values());
  }
  
  destroy() {
    this.workers.hash.terminate();
    this.workers.upload.terminate();
    this.uploads.clear();
  }
}

// Semaphore for concurrency control
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = 0;
    this.queue = [];
  }
  
  async acquire() {
    return new Promise((resolve) => {
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  
  release() {
    this.currentConcurrency--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.currentConcurrency++;
      next();
    }
  }
}