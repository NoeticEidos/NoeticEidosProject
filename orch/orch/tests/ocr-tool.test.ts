import { OCRTool } from '../src/tools/ocr-tool.js';
import { OCRArgs } from '../src/utils/validation.js';

// Mock tesseract.js
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(() => Promise.resolve({
    setParameters: jest.fn(),
    recognize: jest.fn(),
    terminate: jest.fn()
  }))
}));

describe('OCRTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await OCRTool.cleanup();
  });

  describe('argument validation', () => {
    it('should reject missing imageUrl', async () => {
      const result = await OCRTool.execute({});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should reject invalid imageUrl format', async () => {
      const result = await OCRTool.execute({
        imageUrl: 'not-a-url'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should accept valid arguments with defaults', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockResolvedValue({
          data: {
            text: 'Sample text',
            confidence: 95,
            words: [
              {
                text: 'Sample',
                confidence: 96,
                bbox: { x0: 10, y0: 10, x1: 60, y1: 25 }
              },
              {
                text: 'text',
                confidence: 94,
                bbox: { x0: 65, y0: 10, x1: 95, y1: 25 }
              }
            ]
          }
        }),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const result = await OCRTool.execute({
        imageUrl: 'https://example.com/image.jpg'
      });
      
      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Sample text');
    });
  });

  describe('OCR processing', () => {
    it('should process image and return OCR results', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockResolvedValue({
          data: {
            text: 'Hello World\nThis is a test',
            confidence: 85,
            words: [
              {
                text: 'Hello',
                confidence: 90,
                bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }
              },
              {
                text: 'World',
                confidence: 88,
                bbox: { x0: 55, y0: 0, x1: 100, y1: 20 }
              }
            ]
          }
        }),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const args: OCRArgs = {
        imageUrl: 'https://example.com/test.png',
        options: {
          language: 'eng',
          psm: 6,
          oem: 1
        },
        casIntegration: {
          enabled: false
        }
      };

      const result = await OCRTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Hello World\nThis is a test');
      expect(result.data?.confidence).toBe(85);
      expect(result.data?.boxes).toHaveLength(2);
      expect(result.metadata.costEstimate.complexity).toBeDefined();
    });

    it('should handle custom OCR options', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockResolvedValue({
          data: {
            text: 'Custom text',
            confidence: 92,
            words: []
          }
        }),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const args: OCRArgs = {
        imageUrl: 'https://example.com/test.png',
        options: {
          language: 'fra',
          psm: 8,
          oem: 2,
          whitelistChars: 'ABCDEFabcdef0123456789',
          blacklistChars: '!@#$%'
        }
      };

      const result = await OCRTool.execute(args);

      expect(result.success).toBe(true);
      expect(mockWorker.setParameters).toHaveBeenCalledWith({
        tessedit_pageseg_mode: 8,
        tessedit_ocr_engine_mode: 2,
        tessedit_char_whitelist: 'ABCDEFabcdef0123456789',
        tessedit_char_blacklist: '!@#$%'
      });
      expect(mockWorker.recognize).toHaveBeenCalledWith(
        'https://example.com/test.png',
        { lang: 'fra' }
      );
    });
  });

  describe('CAS integration', () => {
    it('should use local cache when CAS is enabled but no endpoint provided', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockResolvedValue({
          data: {
            text: 'Cached result',
            confidence: 90,
            words: []
          }
        }),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const args: OCRArgs = {
        imageUrl: 'https://example.com/cached.png',
        casIntegration: {
          enabled: true
        }
      };

      // First call should process normally
      const result1 = await OCRTool.execute(args);
      expect(result1.success).toBe(true);
      expect(mockWorker.recognize).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await OCRTool.execute(args);
      expect(result2.success).toBe(true);
      expect(result2.data?.text).toBe('Cached result');
      // Worker should not be called again
      expect(mockWorker.recognize).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle OCR processing errors', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockRejectedValue(new Error('OCR failed')),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const result = await OCRTool.execute({
        imageUrl: 'https://example.com/broken.jpg'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCR processing failed');
    });

    it('should handle worker creation errors', async () => {
      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockRejectedValue(new Error('Worker creation failed'));

      const result = await OCRTool.execute({
        imageUrl: 'https://example.com/test.jpg'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCR processing failed');
    });
  });

  describe('cost estimation', () => {
    it('should provide accurate cost estimates', async () => {
      const mockWorker = {
        setParameters: jest.fn(),
        recognize: jest.fn().mockResolvedValue({
          data: { text: 'test', confidence: 90, words: [] }
        }),
        terminate: jest.fn()
      };

      const { createWorker } = await import('tesseract.js');
      (createWorker as jest.Mock).mockResolvedValue(mockWorker);

      const result = await OCRTool.execute({
        imageUrl: 'https://example.com/large-image.jpg'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.costEstimate.tokens).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.computeUnits).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.estimatedDurationMs).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(result.metadata.costEstimate.complexity);
    });
  });
});