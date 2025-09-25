import '@testing-library/jest-dom'

// Mock Web Workers
global.Worker = class MockWorker {
  constructor(url) {
    this.url = url
    this.onmessage = null
    this.onerror = null
  }
  
  postMessage(data) {
    // Mock worker responses
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: { type: 'MOCK_RESPONSE', data } })
      }
    }, 0)
  }
  
  terminate() {
    // Mock termination
  }
}

// Mock fetch
global.fetch = jest.fn()

// Mock crypto.subtle for hashing
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  }
})