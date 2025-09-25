// Upload utility functions for chunked, resumable uploads

export const CHUNK_SIZE_OPTIONS = [
  { value: 256 * 1024, label: '256 KB' },
  { value: 512 * 1024, label: '512 KB' },
  { value: 1024 * 1024, label: '1 MB' },
  { value: 2 * 1024 * 1024, label: '2 MB' },
  { value: 4 * 1024 * 1024, label: '4 MB' },
  { value: 8 * 1024 * 1024, label: '8 MB' },
  { value: 16 * 1024 * 1024, label: '16 MB' }
];

export const CONCURRENCY_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}`
}));

export const UPLOAD_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export const STORAGE_TYPES = {
  S3: 's3',
  GOOGLE_DRIVE: 'google_drive',
  GCS: 'gcs'
};

// Format file size for display
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format upload speed for display
export function formatSpeed(bytesPerSecond) {
  return formatFileSize(bytesPerSecond) + '/s';
}

// Calculate estimated time remaining
export function calculateETA(bytesUploaded, totalBytes, speed) {
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

// Detect if file is compressible
export function isCompressibleFile(filename) {
  const extension = filename.toLowerCase().split('.').pop();
  const compressibleTypes = [
    'txt', 'json', 'xml', 'html', 'css', 'js', 'csv', 'log',
    'md', 'yml', 'yaml', 'ini', 'cfg', 'conf'
  ];
  const alreadyCompressed = [
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mp3', 'avi', 'mkv'
  ];
  
  return compressibleTypes.includes(extension) && !alreadyCompressed.includes(extension);
}

// Generate chunk metadata
export function generateChunkMetadata(file, chunkSize, chunkIndex) {
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  const chunk = file.slice(start, end);
  
  return {
    chunkIndex,
    start,
    end,
    size: end - start,
    chunk,
    isLast: end === file.size
  };
}

// Calculate optimal chunk size based on network conditions
export function calculateOptimalChunkSize(networkSpeed, latency, fileSize) {
  // Base chunk size on network speed and latency
  // Higher latency = larger chunks to reduce round trips
  // Higher speed = larger chunks to reduce overhead
  
  const baseChunkSize = 1024 * 1024; // 1MB base
  const speedFactor = Math.min(networkSpeed / (1024 * 1024), 8); // Cap at 8x
  const latencyFactor = Math.min(latency / 100, 4); // Cap at 4x for 400ms latency
  
  let optimalSize = baseChunkSize * speedFactor * (1 + latencyFactor);
  
  // Ensure it's within our defined range
  const minSize = CHUNK_SIZE_OPTIONS[0].value;
  const maxSize = CHUNK_SIZE_OPTIONS[CHUNK_SIZE_OPTIONS.length - 1].value;
  
  optimalSize = Math.max(minSize, Math.min(optimalSize, maxSize));
  
  // Round to nearest power of 2 for better performance
  return Math.pow(2, Math.round(Math.log2(optimalSize)));
}

// Retry configuration with exponential backoff
export function getRetryConfig(attempt) {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const jitter = Math.random() * 0.1; // 10% jitter
  
  const delay = Math.min(
    baseDelay * Math.pow(2, attempt) * (1 + jitter),
    maxDelay
  );
  
  return {
    delay,
    maxAttempts: 5,
    shouldRetry: (error) => {
      // Retry on network errors, 5xx, and rate limiting
      return (
        !error.response ||
        error.response.status >= 500 ||
        error.response.status === 429 ||
        error.code === 'NETWORK_ERROR'
      );
    }
  };
}

// Network diagnostics
export class NetworkDiagnostics {
  constructor() {
    this.samples = [];
    this.maxSamples = 10;
  }
  
  addSample(speed, latency) {
    this.samples.push({ speed, latency, timestamp: Date.now() });
    
    // Keep only recent samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }
  
  getAverageSpeed() {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, sample) => sum + sample.speed, 0) / this.samples.length;
  }
  
  getAverageLatency() {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, sample) => sum + sample.latency, 0) / this.samples.length;
  }
  
  getLatencyVariance() {
    if (this.samples.length < 2) return 0;
    
    const avgLatency = this.getAverageLatency();
    const variance = this.samples.reduce((sum, sample) => {
      return sum + Math.pow(sample.latency - avgLatency, 2);
    }, 0) / this.samples.length;
    
    return Math.sqrt(variance);
  }
  
  getNetworkStability() {
    const variance = this.getLatencyVariance();
    const avgLatency = this.getAverageLatency();
    
    // Lower coefficient of variation = more stable
    return avgLatency > 0 ? 1 - (variance / avgLatency) : 0;
  }
}