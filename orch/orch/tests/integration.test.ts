import { ToolExecutor, ToolManager } from '../src/index.js';

describe('Integration Tests', () => {
  beforeAll(async () => {
    await ToolManager.initialize();
  });

  afterAll(async () => {
    await ToolManager.cleanup();
  });

  describe('ToolExecutor', () => {
    it('should route to correct tools', async () => {
      // Test OCR routing
      const ocrResult = await ToolExecutor.execute('ocr', {
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9A',
        options: { language: 'eng' }
      });

      expect(ocrResult.success).toBeDefined();
      expect(ocrResult.metadata.costEstimate).toBeDefined();

      // Test NER routing
      const nerResult = await ToolExecutor.execute('ner', {
        text: 'John Smith works at Microsoft in Seattle.'
      });

      expect(nerResult.success).toBe(true);
      expect(nerResult.metadata.costEstimate).toBeDefined();

      // Test Route routing
      const routeResult = await ToolExecutor.execute('route', {
        request: {
          path: '/api/users',
          method: 'GET'
        },
        routes: [
          {
            id: 'users',
            pattern: '/api/users'
          }
        ]
      });

      expect(routeResult.success).toBe(true);
      expect(routeResult.metadata.costEstimate).toBeDefined();
    });

    it('should handle unknown tools', async () => {
      const result = await ToolExecutor.execute('unknown-tool', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool: unknown-tool');
    });

    it('should handle tool execution errors', async () => {
      const result = await ToolExecutor.execute('ocr', {
        // Invalid arguments that will cause validation error
        imageUrl: 'not-a-url'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Cost estimation consistency', () => {
    it('should provide consistent cost estimates across tools', async () => {
      const results = await Promise.all([
        ToolExecutor.execute('ner', {
          text: 'Test text for cost estimation'
        }),
        ToolExecutor.execute('route', {
          request: { path: '/test' },
          routes: [{ id: 'test', pattern: '/test' }]
        })
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.metadata.costEstimate.tokens).toBeGreaterThanOrEqual(0);
        expect(result.metadata.costEstimate.computeUnits).toBeGreaterThanOrEqual(0);
        expect(result.metadata.costEstimate.estimatedDurationMs).toBeGreaterThanOrEqual(0);
        expect(['low', 'medium', 'high']).toContain(result.metadata.costEstimate.complexity);
      });
    });
  });

  describe('Performance tracking', () => {
    it('should track processing times accurately', async () => {
      const startTime = Date.now();
      
      const result = await ToolExecutor.execute('ner', {
        text: 'Performance test with John Smith at Microsoft.'
      });
      
      const endTime = Date.now();
      const actualDuration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThanOrEqual(actualDuration + 10); // Allow 10ms tolerance
    });
  });

  describe('Memory usage', () => {
    it('should not leak memory with repeated executions', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Run multiple operations
      for (let i = 0; i < 10; i++) {
        await ToolExecutor.execute('ner', {
          text: `Test iteration ${i} with John Smith and Microsoft Corporation.`
        });
        
        await ToolExecutor.execute('route', {
          request: { path: `/test-${i}`, method: 'GET' },
          routes: [{ id: `test-${i}`, pattern: `/test-${i}` }]
        });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB for this test)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Concurrent execution', () => {
    it('should handle concurrent tool executions', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        Promise.all([
          ToolExecutor.execute('ner', {
            text: `Concurrent test ${i} with Jane Doe at Apple Inc.`
          }),
          ToolExecutor.execute('route', {
            request: { path: `/concurrent-${i}`, method: 'POST' },
            routes: [{ id: `concurrent-${i}`, pattern: `/concurrent-${i}` }]
          })
        ])
      );

      const results = await Promise.all(promises);
      
      // All executions should succeed
      results.forEach(([nerResult, routeResult]) => {
        expect(nerResult.success).toBe(true);
        expect(routeResult.success).toBe(true);
      });
    });
  });

  describe('Error recovery', () => {
    it('should recover from individual tool failures', async () => {
      // Mix of valid and invalid requests
      const results = await Promise.all([
        ToolExecutor.execute('ner', {
          text: 'Valid NER request with John Smith.'
        }),
        ToolExecutor.execute('ner', {
          // Invalid - missing text
        }),
        ToolExecutor.execute('route', {
          request: { path: '/valid' },
          routes: [{ id: 'valid', pattern: '/valid' }]
        }),
        ToolExecutor.execute('route', {
          // Invalid - missing routes
          request: { path: '/invalid' }
        })
      ]);

      expect(results[0].success).toBe(true);  // Valid NER
      expect(results[1].success).toBe(false); // Invalid NER
      expect(results[2].success).toBe(true);  // Valid Route
      expect(results[3].success).toBe(false); // Invalid Route

      // Valid requests should still work after invalid ones
      const followUpResult = await ToolExecutor.execute('ner', {
        text: 'Follow-up test with Microsoft Corporation.'
      });
      
      expect(followUpResult.success).toBe(true);
    });
  });
});