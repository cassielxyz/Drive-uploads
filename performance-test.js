#!/usr/bin/env node

/**
 * Performance test script for high-speed file uploader
 * Tests upload performance with different configurations
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const TEST_FILE_SIZE = 10 * 1024 * 1024; // 10MB test file

// Create test file
function createTestFile(size, filename) {
  const buffer = Buffer.alloc(size, 'A');
  fs.writeFileSync(filename, buffer);
  return filename;
}

// Test upload performance
async function testUploadPerformance(chunkSize, concurrency) {
  console.log(`\nTesting: ${chunkSize / 1024}KB chunks, ${concurrency} concurrency`);
  
  const testFile = createTestFile(TEST_FILE_SIZE, `test-${Date.now()}.bin`);
  
  try {
    const startTime = performance.now();
    
    // Initialize upload
    const initResponse = await fetch(`${API_BASE}/api/upload/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: path.basename(testFile),
        fileSize: TEST_FILE_SIZE,
        fileHash: 'test-hash',
        chunkCount: Math.ceil(TEST_FILE_SIZE / chunkSize),
        storageType: 's3',
        options: { chunkSize, concurrency }
      })
    });
    
    if (!initResponse.ok) {
      throw new Error(`Init failed: ${initResponse.statusText}`);
    }
    
    const { uploadId, chunkUrls } = await initResponse.json();
    
    // Upload chunks
    const chunkPromises = [];
    const fileBuffer = fs.readFileSync(testFile);
    
    for (let i = 0; i < chunkUrls.length; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, TEST_FILE_SIZE);
      const chunk = fileBuffer.slice(start, end);
      
      const uploadPromise = fetch(chunkUrls[i], {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end - 1}/${TEST_FILE_SIZE}`
        }
      });
      
      chunkPromises.push(uploadPromise);
      
      // Limit concurrency
      if (chunkPromises.length >= concurrency) {
        await Promise.all(chunkPromises);
        chunkPromises.length = 0;
      }
    }
    
    // Wait for remaining chunks
    if (chunkPromises.length > 0) {
      await Promise.all(chunkPromises);
    }
    
    // Finalize upload
    const finalizeResponse = await fetch(`${API_BASE}/api/upload/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        storageType: 's3',
        parts: Array.from({ length: chunkUrls.length }, (_, i) => ({
          ETag: `"chunk-${i}"`,
          PartNumber: i + 1
        }))
      })
    });
    
    if (!finalizeResponse.ok) {
      throw new Error(`Finalize failed: ${finalizeResponse.statusText}`);
    }
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const speed = (TEST_FILE_SIZE / duration) / (1024 * 1024); // MB/s
    
    console.log(`✅ Completed in ${duration.toFixed(2)}s (${speed.toFixed(2)} MB/s)`);
    
    return { duration, speed, success: true };
    
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return { duration: 0, speed: 0, success: false, error: error.message };
  } finally {
    // Clean up test file
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }
}

// Run performance tests
async function runPerformanceTests() {
  console.log('🚀 Starting performance tests...');
  console.log(`📁 Test file size: ${TEST_FILE_SIZE / (1024 * 1024)}MB`);
  console.log(`🌐 API endpoint: ${API_BASE}`);
  
  const testConfigs = [
    { chunkSize: 256 * 1024, concurrency: 1 },   // 256KB, 1 concurrent
    { chunkSize: 256 * 1024, concurrency: 3 },   // 256KB, 3 concurrent
    { chunkSize: 1024 * 1024, concurrency: 1 },  // 1MB, 1 concurrent
    { chunkSize: 1024 * 1024, concurrency: 3 },  // 1MB, 3 concurrent
    { chunkSize: 1024 * 1024, concurrency: 6 },  // 1MB, 6 concurrent
    { chunkSize: 4 * 1024 * 1024, concurrency: 3 }, // 4MB, 3 concurrent
    { chunkSize: 8 * 1024 * 1024, concurrency: 3 }, // 8MB, 3 concurrent
  ];
  
  const results = [];
  
  for (const config of testConfigs) {
    const result = await testUploadPerformance(config.chunkSize, config.concurrency);
    results.push({
      ...config,
      ...result,
      chunkSizeKB: config.chunkSize / 1024
    });
  }
  
  // Print results summary
  console.log('\n📊 Performance Test Results:');
  console.log('┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐');
  console.log('│ Chunk Size  │ Concurrency │ Duration (s)│ Speed (MB/s)│ Status      │');
  console.log('├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤');
  
  results.forEach(result => {
    const status = result.success ? '✅ Success' : '❌ Failed';
    console.log(`│ ${String(result.chunkSizeKB).padEnd(11)} │ ${String(result.concurrency).padEnd(11)} │ ${String(result.duration.toFixed(2)).padEnd(11)} │ ${String(result.speed.toFixed(2)).padEnd(11)} │ ${status.padEnd(11)} │`);
  });
  
  console.log('└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘');
  
  // Find best configuration
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    const best = successfulResults.reduce((prev, current) => 
      current.speed > prev.speed ? current : prev
    );
    
    console.log(`\n🏆 Best Configuration:`);
    console.log(`   Chunk Size: ${best.chunkSizeKB}KB`);
    console.log(`   Concurrency: ${best.concurrency}`);
    console.log(`   Speed: ${best.speed.toFixed(2)} MB/s`);
    console.log(`   Duration: ${best.duration.toFixed(2)}s`);
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('   • For stable, fast connections: Use larger chunks (4-8MB) with high concurrency (4-6)');
  console.log('   • For unstable connections: Use smaller chunks (256KB-1MB) with low concurrency (1-3)');
  console.log('   • Enable auto-tuning to let the system optimize settings automatically');
  console.log('   • Monitor network diagnostics for real-time optimization');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests().catch(console.error);
}

export { runPerformanceTests, testUploadPerformance };