import { RouteTool } from '../src/tools/route-tool.js';
import { RouteArgs } from '../src/utils/validation.js';

describe('RouteTool', () => {
  beforeEach(() => {
    RouteTool.clearCache();
  });

  describe('argument validation', () => {
    it('should reject missing request', async () => {
      const result = await RouteTool.execute({});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should reject missing routes', async () => {
      const result = await RouteTool.execute({
        request: {
          path: '/test',
          method: 'GET'
        }
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should reject empty routes array', async () => {
      const result = await RouteTool.execute({
        request: {
          path: '/test',
          method: 'GET'
        },
        routes: []
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should accept valid arguments with defaults', async () => {
      const result = await RouteTool.execute({
        request: {
          path: '/api/users'
        },
        routes: [
          {
            id: 'users-route',
            pattern: '/api/users'
          }
        ]
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('exact path matching', () => {
    it('should match exact paths', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users-exact',
            pattern: '/api/users',
            methods: ['GET'],
            priority: 1
          },
          {
            id: 'users-wildcard',
            pattern: '/api/*',
            methods: ['GET'],
            priority: 0
          }
        ],
        options: {
          strategy: 'exact-match'
        }
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('users-exact');
      expect(result.data?.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('pattern matching', () => {
    it('should match wildcard patterns', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users/123',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'user-by-id',
            pattern: '/api/users/*',
            methods: ['GET']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('user-by-id');
      expect(result.data?.confidence).toBeGreaterThan(0.5);
    });

    it('should match parameter patterns', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users/john-doe',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'user-by-name',
            pattern: '/api/users/:username',
            methods: ['GET']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('user-by-name');
      expect(result.data?.confidence).toBeGreaterThan(0.5);
    });

    it('should prefer more specific patterns', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users/123',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users-wildcard',
            pattern: '/api/*',
            methods: ['GET']
          },
          {
            id: 'users-specific',
            pattern: '/api/users/*',
            methods: ['GET']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('users-specific');
    });
  });

  describe('HTTP method matching', () => {
    it('should match HTTP methods correctly', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users',
          method: 'POST',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users-get',
            pattern: '/api/users',
            methods: ['GET']
          },
          {
            id: 'users-post',
            pattern: '/api/users',
            methods: ['POST']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('users-post');
    });

    it('should reject routes with non-matching methods', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users',
          method: 'DELETE',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users-get',
            pattern: '/api/users',
            methods: ['GET', 'POST']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No matching route found');
    });
  });

  describe('header conditions', () => {
    it('should match header conditions', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/data',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          },
          query: {}
        },
        routes: [
          {
            id: 'api-data',
            pattern: '/api/data',
            methods: ['GET'],
            conditions: {
              headers: {
                'Content-Type': 'application/json'
              }
            }
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('api-data');
    });

    it('should handle wildcard header matching', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/data',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer token123'
          },
          query: {}
        },
        routes: [
          {
            id: 'api-data',
            pattern: '/api/data',
            methods: ['GET'],
            conditions: {
              headers: {
                'Authorization': '*'
              }
            }
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('api-data');
    });
  });

  describe('query parameter conditions', () => {
    it('should match query parameter conditions', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/search',
          method: 'GET',
          headers: {},
          query: {
            type: 'user',
            limit: '10'
          }
        },
        routes: [
          {
            id: 'user-search',
            pattern: '/api/search',
            methods: ['GET'],
            conditions: {
              query: {
                type: 'user'
              }
            }
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('user-search');
    });
  });

  describe('body conditions', () => {
    it('should match body conditions', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/webhook',
          method: 'POST',
          headers: {},
          query: {},
          body: {
            event: 'user.created',
            data: { userId: 123 }
          }
        },
        routes: [
          {
            id: 'user-webhook',
            pattern: '/api/webhook',
            methods: ['POST'],
            conditions: {
              body: {
                event: 'user.created'
              }
            }
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('user-webhook');
    });
  });

  describe('priority-based routing', () => {
    it('should respect route priorities when scores are close', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users-low-priority',
            pattern: '/api/users',
            methods: ['GET'],
            priority: 1
          },
          {
            id: 'users-high-priority',
            pattern: '/api/users',
            methods: ['GET'],
            priority: 10
          }
        ],
        options: {
          strategy: 'priority'
        }
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('users-high-priority');
    });
  });

  describe('fallback routing', () => {
    it('should use fallback route when no matches found', async () => {
      const args: RouteArgs = {
        request: {
          path: '/unknown/path',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'api-routes',
            pattern: '/api/*',
            methods: ['GET']
          },
          {
            id: 'fallback',
            pattern: '/*',
            methods: ['GET']
          }
        ],
        options: {
          strategy: 'priority',
          fallbackRoute: 'fallback'
        }
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.selectedRoute).toBe('fallback');
    });
  });

  describe('caching', () => {
    it('should cache routing decisions', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'users',
            pattern: '/api/users',
            methods: ['GET']
          }
        ],
        options: {
          enableCaching: true
        }
      };

      // First request
      const result1 = await RouteTool.execute(args);
      expect(result1.success).toBe(true);
      
      const firstProcessingTime = result1.metadata.processingTime;

      // Second request (should be faster due to caching)
      const result2 = await RouteTool.execute(args);
      expect(result2.success).toBe(true);
      expect(result2.data?.selectedRoute).toBe(result1.data?.selectedRoute);
      
      // Cache stats should show entries
      const stats = RouteTool.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('alternatives generation', () => {
    it('should provide alternative routes with scores', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/users/123',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'user-specific',
            pattern: '/api/users/:id',
            methods: ['GET']
          },
          {
            id: 'users-wildcard',
            pattern: '/api/users/*',
            methods: ['GET']
          },
          {
            id: 'api-wildcard',
            pattern: '/api/*',
            methods: ['GET']
          }
        ]
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.alternatives.length).toBeGreaterThan(0);
      expect(result.data?.alternatives.length).toBeLessThanOrEqual(3);
      
      result.data?.alternatives.forEach(alt => {
        expect(alt.score).toBeGreaterThanOrEqual(0);
        expect(alt.score).toBeLessThanOrEqual(1);
        expect(alt.reason).toBeDefined();
        expect(alt.route).toBeDefined();
      });
    });
  });

  describe('cost estimation', () => {
    it('should provide accurate cost estimates', async () => {
      const args: RouteArgs = {
        request: {
          path: '/api/test',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          query: { param1: 'value1', param2: 'value2' }
        },
        routes: Array.from({ length: 50 }, (_, i) => ({
          id: `route-${i}`,
          pattern: `/api/route-${i}`,
          methods: ['GET']
        }))
      };

      const result = await RouteTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.metadata.costEstimate.tokens).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.computeUnits).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.estimatedDurationMs).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(result.metadata.costEstimate.complexity);
    });
  });

  describe('error handling', () => {
    it('should handle malformed route patterns gracefully', async () => {
      const args: RouteArgs = {
        request: {
          path: '/test',
          method: 'GET',
          headers: {},
          query: {}
        },
        routes: [
          {
            id: 'malformed',
            pattern: '[invalid-pattern',
            methods: ['GET']
          }
        ]
      };

      // Should not crash, but may not match
      const result = await RouteTool.execute(args);
      
      // Either succeeds with low confidence or fails gracefully
      if (result.success) {
        expect(result.data?.confidence).toBeLessThan(0.5);
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });
});