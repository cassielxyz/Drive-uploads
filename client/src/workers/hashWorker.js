// Web Worker for calculating file hashes without blocking the main thread

self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'HASH_FILE':
      hashFile(data.file, data.algorithm || 'SHA-256')
        .then(hash => {
          self.postMessage({
            type: 'HASH_COMPLETE',
            data: { hash, algorithm: data.algorithm || 'SHA-256' }
          });
        })
        .catch(error => {
          self.postMessage({
            type: 'HASH_ERROR',
            data: { error: error.message }
          });
        });
      break;
      
    case 'HASH_CHUNK':
      hashChunk(data.chunk, data.algorithm || 'SHA-256')
        .then(hash => {
          self.postMessage({
            type: 'CHUNK_HASH_COMPLETE',
            data: { 
              hash, 
              chunkIndex: data.chunkIndex,
              algorithm: data.algorithm || 'SHA-256'
            }
          });
        })
        .catch(error => {
          self.postMessage({
            type: 'CHUNK_HASH_ERROR',
            data: { 
              error: error.message,
              chunkIndex: data.chunkIndex
            }
          });
        });
      break;
  }
};

async function hashFile(file, algorithm = 'SHA-256') {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  return arrayBufferToHex(hashBuffer);
}

async function hashChunk(chunk, algorithm = 'SHA-256') {
  const buffer = await chunk.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  return arrayBufferToHex(hashBuffer);
}

function arrayBufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  const hexCodes = [...byteArray].map(value => {
    const hexCode = value.toString(16);
    const paddedHexCode = hexCode.padStart(2, '0');
    return paddedHexCode;
  });
  return hexCodes.join('');
}