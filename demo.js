#!/usr/bin/env node

/**
 * Demo script for high-speed file uploader
 * Creates sample files and demonstrates upload functionality
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const DEMO_DIR = './demo-files';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';

// Create demo files of different sizes
function createDemoFiles() {
  console.log('📁 Creating demo files...');
  
  if (!fs.existsSync(DEMO_DIR)) {
    fs.mkdirSync(DEMO_DIR);
  }
  
  const files = [
    { name: 'small.txt', size: 1024 },           // 1KB
    { name: 'medium.txt', size: 1024 * 1024 },   // 1MB
    { name: 'large.txt', size: 10 * 1024 * 1024 }, // 10MB
    { name: 'image.jpg', size: 5 * 1024 * 1024 },  // 5MB
    { name: 'document.pdf', size: 2 * 1024 * 1024 } // 2MB
  ];
  
  files.forEach(file => {
    const content = 'A'.repeat(file.size);
    const filePath = path.join(DEMO_DIR, file.name);
    fs.writeFileSync(filePath, content);
    console.log(`   ✅ Created ${file.name} (${formatFileSize(file.size)})`);
  });
  
  return files.map(f => path.join(DEMO_DIR, f.name));
}

// Calculate file hash
function calculateFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload a single file
async function uploadFile(filePath, storageType = 's3') {
  const filename = path.basename(filePath);
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const fileHash = calculateFileHash(filePath);
  
  console.log(`\n📤 Uploading ${filename} (${formatFileSize(fileSize)})...`);
  
  try {
    // Initialize upload
    const initResponse = await fetch(`${API_BASE}/api/upload/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        fileSize,
        fileHash,
        chunkCount: Math.ceil(fileSize / (1024 * 1024)), // 1MB chunks
        storageType
      })
    });
    
    if (!initResponse.ok) {
      throw new Error(`Init failed: ${initResponse.statusText}`);
    }
    
    const { uploadId, chunkUrls } = await initResponse.json();
    console.log(`   📋 Upload ID: ${uploadId}`);
    console.log(`   🔢 Chunks: ${chunkUrls.length}`);
    
    // Upload chunks
    const fileBuffer = fs.readFileSync(filePath);
    const chunkSize = 1024 * 1024; // 1MB
    
    for (let i = 0; i < chunkUrls.length; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunk = fileBuffer.slice(start, end);
      
      const uploadResponse = await fetch(chunkUrls[i], {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end - 1}/${fileSize}`
        }
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Chunk ${i + 1} upload failed: ${uploadResponse.statusText}`);
      }
      
      const progress = ((i + 1) / chunkUrls.length) * 100;
      process.stdout.write(`\r   📊 Progress: ${progress.toFixed(1)}%`);
    }
    
    console.log('\n   ✅ All chunks uploaded');
    
    // Finalize upload
    const finalizeResponse = await fetch(`${API_BASE}/api/upload/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        storageType,
        parts: Array.from({ length: chunkUrls.length }, (_, i) => ({
          ETag: `"chunk-${i}"`,
          PartNumber: i + 1
        }))
      })
    });
    
    if (!finalizeResponse.ok) {
      throw new Error(`Finalize failed: ${finalizeResponse.statusText}`);
    }
    
    const { finalUrl } = await finalizeResponse.json();
    console.log(`   🔗 Final URL: ${finalUrl}`);
    
    return { success: true, uploadId, finalUrl };
    
  } catch (error) {
    console.error(`   ❌ Upload failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Run demo
async function runDemo() {
  console.log('🚀 High Speed File Uploader Demo');
  console.log('================================\n');
  
  // Check if server is running
  try {
    const healthResponse = await fetch(`${API_BASE}/health`);
    if (!healthResponse.ok) {
      throw new Error('Server not responding');
    }
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Server is not running. Please start the server first:');
    console.error('   npm run dev');
    process.exit(1);
  }
  
  // Create demo files
  const demoFiles = createDemoFiles();
  
  // Upload files
  console.log('\n📤 Starting uploads...');
  const results = [];
  
  for (const filePath of demoFiles) {
    const result = await uploadFile(filePath, 's3');
    results.push({ file: path.basename(filePath), ...result });
  }
  
  // Summary
  console.log('\n📊 Upload Summary:');
  console.log('==================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n📁 Successfully uploaded files:');
    successful.forEach(result => {
      console.log(`   • ${result.file} → ${result.finalUrl}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed uploads:');
    failed.forEach(result => {
      console.log(`   • ${result.file}: ${result.error}`);
    });
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up demo files...');
  if (fs.existsSync(DEMO_DIR)) {
    fs.rmSync(DEMO_DIR, { recursive: true });
    console.log('   ✅ Demo files removed');
  }
  
  console.log('\n🎉 Demo completed!');
  console.log('\nNext steps:');
  console.log('1. Open http://localhost:3000 in your browser');
  console.log('2. Try uploading your own files');
  console.log('3. Experiment with different settings');
  console.log('4. Check the network diagnostics');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo, uploadFile, createDemoFiles };