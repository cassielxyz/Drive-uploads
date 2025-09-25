import request from 'supertest';
import app from '../index.js';

describe('Upload API', () => {
  describe('POST /api/upload/initialize', () => {
    it('should initialize upload with valid data', async () => {
      const uploadData = {
        filename: 'test.txt',
        fileSize: 1024,
        fileHash: 'test-hash',
        chunkCount: 1,
        storageType: 's3'
      };

      const response = await request(app)
        .post('/api/upload/initialize')
        .send(uploadData)
        .expect(200);

      expect(response.body).toHaveProperty('uploadId');
      expect(response.body).toHaveProperty('chunkUrls');
      expect(response.body.chunkUrls).toHaveLength(1);
    });

    it('should reject upload with missing fields', async () => {
      const response = await request(app)
        .post('/api/upload/initialize')
        .send({ filename: 'test.txt' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload with file size too large', async () => {
      const uploadData = {
        filename: 'huge.txt',
        fileSize: 11 * 1024 * 1024 * 1024, // 11GB
        fileHash: 'test-hash',
        chunkCount: 1,
        storageType: 's3'
      };

      const response = await request(app)
        .post('/api/upload/initialize')
        .send(uploadData)
        .expect(400);

      expect(response.body.error).toContain('exceeds maximum limit');
    });
  });

  describe('POST /api/upload/finalize', () => {
    it('should finalize upload with valid data', async () => {
      // First initialize an upload
      const initResponse = await request(app)
        .post('/api/upload/initialize')
        .send({
          filename: 'test.txt',
          fileSize: 1024,
          fileHash: 'test-hash',
          chunkCount: 1,
          storageType: 's3'
        });

      const { uploadId } = initResponse.body;

      // Then finalize it
      const response = await request(app)
        .post('/api/upload/finalize')
        .send({ uploadId, storageType: 's3' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('finalUrl');
    });

    it('should reject finalization with invalid upload ID', async () => {
      const response = await request(app)
        .post('/api/upload/finalize')
        .send({ uploadId: 'invalid-id', storageType: 's3' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/upload/status/:uploadId', () => {
    it('should return upload status', async () => {
      // Initialize an upload
      const initResponse = await request(app)
        .post('/api/upload/initialize')
        .send({
          filename: 'test.txt',
          fileSize: 1024,
          fileHash: 'test-hash',
          chunkCount: 1,
          storageType: 's3'
        });

      const { uploadId } = initResponse.body;

      const response = await request(app)
        .get(`/api/upload/status/${uploadId}`)
        .expect(200);

      expect(response.body).toHaveProperty('uploadId', uploadId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('progress');
    });
  });
});