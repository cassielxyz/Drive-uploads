// Web Worker for handling upload operations in the background

self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'UPLOAD_CHUNK':
      uploadChunk(data)
        .then(result => {
          self.postMessage({
            type: 'CHUNK_UPLOAD_COMPLETE',
            data: { ...result, chunkIndex: data.chunkIndex }
          });
        })
        .catch(error => {
          self.postMessage({
            type: 'CHUNK_UPLOAD_ERROR',
            data: { 
              error: error.message,
              chunkIndex: data.chunkIndex,
              retryable: error.retryable !== false
            }
          });
        });
      break;
  }
};

async function uploadChunk({ 
  chunk, 
  uploadUrl, 
  headers = {}, 
  method = 'PUT',
  chunkIndex,
  retryConfig = { maxAttempts: 3, baseDelay: 1000 }
}) {
  let lastError;
  
  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      const response = await fetch(uploadUrl, {
        method,
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return {
        success: true,
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        }
      };
      
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 429 (rate limiting)
      if (error.message.includes('HTTP 4') && !error.message.includes('HTTP 429')) {
        break;
      }
      
      // Wait before retry (exponential backoff with jitter)
      if (attempt < retryConfig.maxAttempts - 1) {
        const delay = retryConfig.baseDelay * Math.pow(2, attempt) * (1 + Math.random() * 0.1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  const error = new Error(`Upload failed after ${retryConfig.maxAttempts} attempts: ${lastError.message}`);
  error.retryable = lastError.message.includes('HTTP 5') || lastError.message.includes('NetworkError');
  throw error;
}