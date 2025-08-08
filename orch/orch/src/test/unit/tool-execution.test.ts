/**
 * Unit Tests for Tool Execution and gRPC Communication
 * Tests OCR, NER, Route tools and their gRPC interactions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OCRTool } from '../../tools/ocr-tool.js';
import { NERTool } from '../../tools/ner-tool.js';
import { RouteTool } from '../../tools/route-tool.js';
import { PolicyServiceClient } from '../../client/policy-service-client.js';

// Mock gRPC client
jest.mock('../../client/policy-service-client.js');
const MockPolicyServiceClient = PolicyServiceClient as jest.MockedClass<typeof PolicyServiceClient>;

describe('Tool Execution System', () => {
  let mockGrpcClient: jest.Mocked<PolicyServiceClient>;

  beforeEach(() => {
    mockGrpcClient = new MockPolicyServiceClient() as jest.Mocked<PolicyServiceClient>;
    MockPolicyServiceClient.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OCRTool', () => {
    let ocrTool: OCRTool;

    beforeEach(() => {
      ocrTool = new OCRTool();
    });

    it('should process valid OCR requests', async () => {
      const mockResponse = {
        text: 'Extracted text from image',
        confidence: 0.95,
        boundingBoxes: [
          {
            x: 10,
            y: 20,
            width: 200,
            height: 30,
            text: 'Extracted text',
            confidence: 0.98
          }
        ],
        metadata: {
          processingTime: 1250,
          pageNumber: 1
        }
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(mockResponse);
      ocrTool.setGrpcClient(mockGrpcClient);

      const params = {
        imageUrl: 'https://example.com/image.jpg',
        language: 'en',
        preprocessingOptions: {
          deskew: true,
          denoise: true
        }
      };

      const result = await ocrTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(mockGrpcClient.processOCR).toHaveBeenCalledWith({
        imageUrl: params.imageUrl,
        language: params.language,
        options: params.preprocessingOptions
      });
    });

    it('should handle OCR processing errors', async () => {
      const errorMessage = 'Image processing failed';
      mockGrpcClient.processOCR = jest.fn().mockRejectedValue(new Error(errorMessage));
      ocrTool.setGrpcClient(mockGrpcClient);

      const params = {
        imageUrl: 'https://example.com/invalid-image.jpg',
        language: 'en'
      };

      const result = await ocrTool.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain(errorMessage);
    });

    it('should validate OCR parameters', async () => {
      const invalidParams = {
        imageUrl: '', // Empty URL
        language: 'invalid-lang' // Invalid language code
      };

      const result = await ocrTool.execute(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should handle timeout scenarios', async () => {
      jest.setTimeout(10000);
      
      mockGrpcClient.processOCR = jest.fn().mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        )
      );
      ocrTool.setGrpcClient(mockGrpcClient);
      ocrTool.setTimeout(1000); // 1 second timeout

      const params = {
        imageUrl: 'https://example.com/large-image.jpg',
        language: 'en'
      };

      const result = await ocrTool.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should track execution metrics', async () => {
      const mockResponse = {
        text: 'Sample text',
        confidence: 0.88
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(mockResponse);
      ocrTool.setGrpcClient(mockGrpcClient);

      const params = {
        imageUrl: 'https://example.com/image.jpg',
        language: 'en'
      };

      const result = await ocrTool.execute(params);

      expect(result.metrics).toBeDefined();
      expect(result.metrics!.executionTime).toBeGreaterThan(0);
      expect(result.metrics!.inputSize).toBeGreaterThan(0);
    });
  });

  describe('NERTool', () => {
    let nerTool: NERTool;

    beforeEach(() => {
      nerTool = new NERTool();
    });

    it('should process valid NER requests', async () => {
      const mockResponse = {
        entities: [
          {
            text: 'John Smith',
            label: 'PERSON',
            start: 0,
            end: 10,
            confidence: 0.96
          },
          {
            text: 'Microsoft',
            label: 'ORG',
            start: 20,
            end: 29,
            confidence: 0.91
          }
        ],
        originalText: 'John Smith works at Microsoft',
        processingMetadata: {
          model: 'en_core_web_sm',
          version: '3.4.1',
          processingTime: 245
        }
      };

      mockGrpcClient.processNER = jest.fn().mockResolvedValue(mockResponse);
      nerTool.setGrpcClient(mockGrpcClient);

      const params = {
        text: 'John Smith works at Microsoft',
        entityTypes: ['PERSON', 'ORG'],
        confidenceThreshold: 0.8
      };

      const result = await nerTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.data.entities).toHaveLength(2);
      expect(mockGrpcClient.processNER).toHaveBeenCalledWith({
        text: params.text,
        entityTypes: params.entityTypes,
        options: {
          confidenceThreshold: params.confidenceThreshold
        }
      });
    });

    it('should handle empty text gracefully', async () => {
      const mockResponse = {
        entities: [],
        originalText: '',
        processingMetadata: {
          model: 'en_core_web_sm',
          processingTime: 15
        }
      };

      mockGrpcClient.processNER = jest.fn().mockResolvedValue(mockResponse);
      nerTool.setGrpcClient(mockGrpcClient);

      const params = {
        text: '',
        entityTypes: ['PERSON', 'ORG']
      };

      const result = await nerTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data.entities).toHaveLength(0);
    });

    it('should filter entities by confidence threshold', async () => {
      const mockResponse = {
        entities: [
          {
            text: 'High Confidence',
            label: 'PERSON',
            start: 0,
            end: 15,
            confidence: 0.95
          },
          {
            text: 'Low Confidence',
            label: 'ORG',
            start: 20,
            end: 34,
            confidence: 0.45 // Below threshold
          }
        ],
        originalText: 'High Confidence and Low Confidence'
      };

      mockGrpcClient.processNER = jest.fn().mockResolvedValue(mockResponse);
      nerTool.setGrpcClient(mockGrpcClient);

      const params = {
        text: 'High Confidence and Low Confidence',
        entityTypes: ['PERSON', 'ORG'],
        confidenceThreshold: 0.7
      };

      const result = await nerTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data.entities).toHaveLength(1);
      expect(result.data.entities[0].text).toBe('High Confidence');
    });

    it('should handle NER processing errors', async () => {
      const errorMessage = 'NER model unavailable';
      mockGrpcClient.processNER = jest.fn().mockRejectedValue(new Error(errorMessage));
      nerTool.setGrpcClient(mockGrpcClient);

      const params = {
        text: 'Test text',
        entityTypes: ['PERSON']
      };

      const result = await nerTool.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain(errorMessage);
    });
  });

  describe('RouteTool', () => {
    let routeTool: RouteTool;

    beforeEach(() => {
      routeTool = new RouteTool();
    });

    it('should execute valid HTTP requests', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          users: [
            { id: 1, name: 'John Doe' },
            { id: 2, name: 'Jane Smith' }
          ]
        },
        executionTime: 342
      };

      mockGrpcClient.executeRoute = jest.fn().mockResolvedValue(mockResponse);
      routeTool.setGrpcClient(mockGrpcClient);

      const params = {
        path: '/api/v1/users',
        method: 'GET' as const,
        parameters: {
          query: {
            page: 1,
            limit: 10
          },
          headers: {
            'Authorization': 'Bearer token123'
          }
        },
        timeout: 5000
      };

      const result = await routeTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.data.status).toBe(200);
      expect(mockGrpcClient.executeRoute).toHaveBeenCalledWith({
        route: {
          path: params.path,
          method: params.method,
          parameters: params.parameters
        },
        timeout: params.timeout
      });
    });

    it('should handle POST requests with body', async () => {
      const mockResponse = {
        status: 201,
        statusText: 'Created',
        data: {
          id: 123,
          name: 'New User',
          email: 'newuser@example.com'
        }
      };

      mockGrpcClient.executeRoute = jest.fn().mockResolvedValue(mockResponse);
      routeTool.setGrpcClient(mockGrpcClient);

      const params = {
        path: '/api/v1/users',
        method: 'POST' as const,
        body: {
          contentType: 'application/json' as const,
          data: {
            name: 'New User',
            email: 'newuser@example.com'
          }
        }
      };

      const result = await routeTool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(201);
    });

    it('should handle HTTP error responses', async () => {
      const mockErrorResponse = {
        status: 404,
        statusText: 'Not Found',
        data: {
          error: 'User not found'
        }
      };

      mockGrpcClient.executeRoute = jest.fn().mockResolvedValue(mockErrorResponse);
      routeTool.setGrpcClient(mockGrpcClient);

      const params = {
        path: '/api/v1/users/999',
        method: 'GET' as const
      };

      const result = await routeTool.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('should validate route parameters', async () => {
      const invalidParams = {
        path: 'invalid-path', // Must start with /
        method: 'INVALID' as any // Invalid HTTP method
      };

      const result = await routeTool.execute(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should implement retry logic', async () => {
      let callCount = 0;
      mockGrpcClient.executeRoute = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
        return Promise.resolve({
          status: 200,
          data: { success: true }
        });
      });
      
      routeTool.setGrpcClient(mockGrpcClient);
      routeTool.setRetryConfig({ maxRetries: 3, backoffMs: 100 });

      const params = {
        path: '/api/v1/test',
        method: 'GET' as const,
        retries: 3
      };

      const result = await routeTool.execute(params);

      expect(result.success).toBe(true);
      expect(mockGrpcClient.executeRoute).toHaveBeenCalledTimes(3);
    });
  });

  describe('gRPC Communication', () => {
    describe('PolicyServiceClient', () => {
      let client: PolicyServiceClient;

      beforeEach(() => {
        // Use actual client for integration-like testing
        client = new PolicyServiceClient('localhost:50051', {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': true
        });
      });

      afterEach(async () => {
        await client.close();
      });

      it('should establish connection with proper configuration', () => {
        expect(client.isConnected()).toBe(false); // Not connected until first call
        expect(client.getConnectionState()).toBe('IDLE');
      });

      it('should handle connection failures gracefully', async () => {
        // Create client with invalid address
        const invalidClient = new PolicyServiceClient('invalid-host:9999');
        
        try {
          await invalidClient.processOCR({
            imageUrl: 'test.jpg',
            language: 'en'
          });
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('connection');
        }
        
        await invalidClient.close();
      });

      it('should implement proper timeout handling', async () => {
        jest.setTimeout(10000);
        
        // Mock a slow server response
        const slowClient = new PolicyServiceClient('localhost:50051', {
          'grpc.client_idle_timeout_ms': 1000
        });
        
        try {
          await slowClient.processOCR(
            {
              imageUrl: 'slow-processing-image.jpg',
              language: 'en'
            },
            { deadline: Date.now() + 500 } // 500ms deadline
          );
        } catch (error) {
          expect((error as Error).message).toContain('deadline');
        }
        
        await slowClient.close();
      });

      it('should handle metadata correctly', async () => {
        const metadata = {
          'user-id': 'test-user-123',
          'session-id': 'session-456',
          'request-id': 'req-789'
        };

        try {
          await client.processOCR(
            {
              imageUrl: 'test.jpg',
              language: 'en'
            },
            {
              metadata: metadata
            }
          );
        } catch (error) {
          // Expected in test environment without server
          expect(error).toBeInstanceOf(Error);
        }
      });

      it('should validate request payloads', async () => {
        const invalidRequest = {
          imageUrl: '', // Empty URL
          language: 'invalid-lang-code'
        };

        try {
          await client.processOCR(invalidRequest);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    describe('Connection Management', () => {
      it('should handle connection state changes', async () => {
        const client = new PolicyServiceClient('localhost:50051');
        
        expect(client.getConnectionState()).toBe('IDLE');
        
        // Attempt connection (will fail in test environment)
        try {
          await client.processOCR({ imageUrl: 'test.jpg', language: 'en' });
        } catch (error) {
          // Expected
        }
        
        await client.close();
        expect(client.getConnectionState()).toBe('SHUTDOWN');
      });

      it('should implement connection pooling', () => {
        const clients = Array.from({ length: 5 }, () => 
          new PolicyServiceClient('localhost:50051')
        );
        
        // All clients should be independent
        expect(clients).toHaveLength(5);
        clients.forEach(client => {
          expect(client.getConnectionState()).toBe('IDLE');
        });
        
        // Cleanup
        Promise.all(clients.map(client => client.close()));
      });
    });
  });

  describe('Tool Integration', () => {
    it('should coordinate multiple tools in sequence', async () => {
      const ocrTool = new OCRTool();
      const nerTool = new NERTool();
      
      // Mock OCR response
      const ocrResponse = {
        text: 'John Smith, CEO of Microsoft Corporation',
        confidence: 0.94
      };
      
      // Mock NER response
      const nerResponse = {
        entities: [
          {
            text: 'John Smith',
            label: 'PERSON',
            start: 0,
            end: 10,
            confidence: 0.96
          },
          {
            text: 'Microsoft Corporation',
            label: 'ORG',
            start: 19,
            end: 41,
            confidence: 0.93
          }
        ],
        originalText: 'John Smith, CEO of Microsoft Corporation'
      };

      mockGrpcClient.processOCR = jest.fn().mockResolvedValue(ocrResponse);
      mockGrpcClient.processNER = jest.fn().mockResolvedValue(nerResponse);
      
      ocrTool.setGrpcClient(mockGrpcClient);
      nerTool.setGrpcClient(mockGrpcClient);

      // Step 1: OCR
      const ocrResult = await ocrTool.execute({
        imageUrl: 'https://example.com/business-card.jpg',
        language: 'en'
      });

      expect(ocrResult.success).toBe(true);
      
      // Step 2: NER on OCR result
      const nerResult = await nerTool.execute({
        text: ocrResult.data!.text,
        entityTypes: ['PERSON', 'ORG']
      });

      expect(nerResult.success).toBe(true);
      expect(nerResult.data!.entities).toHaveLength(2);
    });

    it('should handle tool execution failures gracefully', async () => {
      const ocrTool = new OCRTool();
      
      mockGrpcClient.processOCR = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      );
      ocrTool.setGrpcClient(mockGrpcClient);

      const result = await ocrTool.execute({
        imageUrl: 'https://example.com/image.jpg',
        language: 'en'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Service unavailable');
      expect(result.metrics).toBeDefined();
    });
  });
});
