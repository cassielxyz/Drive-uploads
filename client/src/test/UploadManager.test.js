import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UploadManager } from '../services/UploadManager.js'
import { UPLOAD_STATUS } from '../utils/uploadUtils.js'

// Mock fetch
global.fetch = vi.fn()

describe('UploadManager', () => {
  let uploadManager
  let mockFile

  beforeEach(() => {
    uploadManager = new UploadManager({
      chunkSize: 1024 * 1024, // 1MB
      concurrency: 3
    })
    
    mockFile = new File(['test content'], 'test.txt', {
      type: 'text/plain'
    })
    
    // Reset fetch mock
    vi.clearAllMocks()
  })

  describe('createUpload', () => {
    it('should create a new upload with correct properties', async () => {
      const upload = await uploadManager.createUpload(mockFile, 's3')
      
      expect(upload).toMatchObject({
        file: mockFile,
        storageType: 's3',
        status: UPLOAD_STATUS.PENDING,
        progress: 0,
        chunks: expect.any(Array)
      })
    })

    it('should calculate correct number of chunks', async () => {
      const largeFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large.txt')
      const upload = await uploadManager.createUpload(largeFile, 's3')
      
      expect(upload.chunks).toHaveLength(5) // 5MB file with 1MB chunks
    })
  })

  describe('chunk calculation', () => {
    it('should generate correct chunk metadata', async () => {
      const upload = await uploadManager.createUpload(mockFile, 's3')
      const chunk = upload.chunks[0]
      
      expect(chunk).toMatchObject({
        chunkIndex: 0,
        start: 0,
        end: mockFile.size,
        size: mockFile.size,
        isLast: true
      })
    })
  })

  describe('progress tracking', () => {
    it('should update progress when chunks complete', async () => {
      const upload = await uploadManager.createUpload(mockFile, 's3')
      
      // Simulate chunk completion
      upload.completedChunks.add(0)
      uploadManager.updateUploadProgress(upload)
      
      expect(upload.progress).toBe(100)
    })
  })

  describe('error handling', () => {
    it('should handle upload initialization errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))
      
      const upload = await uploadManager.createUpload(mockFile, 's3')
      
      try {
        await uploadManager.startUpload(upload.id)
      } catch (error) {
        expect(error.message).toContain('Network error')
      }
    })
  })
})