/**
 * Unit tests for SafetyManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SafetyManager, SafetyConfig, Step, SafetyValidationError } from '../../../src/safety/managers/SafetyManager.js';

describe('SafetyManager', () => {
  let safetyManager: SafetyManager;
  let config: SafetyConfig;

  beforeEach(() => {
    config = {
      budgetLimits: {
        maxTokens: 10000,
        maxCost: 10,
        maxLatency: 5000,
        periodMs: 3600000 // 1 hour
      },
      signature: {
        secretKey: 'test-secret-key-32-characters-long-minimum',
        algorithm: 'sha256' as const
      },
      depthLimits: {
        maxDepth: 5,
        maxBranching: 3
      },
      capabilities: {
        allowed: ['file:read:user', 'network:http:get'],
        restricted: ['file:write:system', 'network:admin'],
        requireApproval: ['file:delete:user']
      },
      validation: {
        strictMode: true,
        allowUnknownProperties: false,
        coerceTypes: false
      }
    };

    safetyManager = new SafetyManager(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(safetyManager).toBeDefined();
      const stats = safetyManager.getStats();
      expect(stats.validation.schemasCompiled).toBe(3); // ocr, ner, route
    });

    it('should throw error with invalid signature key', () => {
      const invalidConfig = {
        ...config,
        signature: {
          secretKey: 'too-short',
          algorithm: 'sha256' as const
        }
      };

      expect(() => new SafetyManager(invalidConfig)).toThrow('Secret key must be at least 32 characters long');
    });
  });

  describe('Step Validation', () => {
    it('should validate valid OCR step', async () => {
      const step: Step = {
        id: 'step-1',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Sample extracted text',
          confidence: 0.95
        }),
        metadata: {
          timestamp: Date.now(),
          userId: 'user-123',
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.sanitizedData).toBeDefined();
      expect(result.sanitizedData.text).toBe('Sample extracted text');
    });

    it('should validate valid NER step', async () => {
      const step: Step = {
        id: 'step-2',
        type: 'ner',
        args_json: JSON.stringify({
          entities: [
            {
              text: 'John Smith',
              label: 'PERSON',
              start: 0,
              end: 10,
              confidence: 0.98
            }
          ],
          originalText: 'John Smith is a developer'
        }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate valid Route step', async () => {
      const step: Step = {
        id: 'step-3',
        type: 'route',
        args_json: JSON.stringify({
          path: '/api/v1/users',
          method: 'GET'
        }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject step with invalid JSON', async () => {
      const step: Step = {
        id: 'step-invalid',
        type: 'ocr',
        args_json: '{ invalid json }',
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid JSON in args_json');
    });

    it('should reject step with schema validation errors', async () => {
      const step: Step = {
        id: 'step-invalid-schema',
        type: 'ocr',
        args_json: JSON.stringify({
          confidence: 0.95
          // missing required 'text' field
        }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("must have required property 'text'");
    });

    it('should allow custom step type with warning', async () => {
      const step: Step = {
        id: 'step-custom',
        type: 'custom',
        args_json: JSON.stringify({
          customField: 'custom value'
        }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Custom step type - skipping schema validation');
    });

    it('should reject unknown step type', async () => {
      const step: Step = {
        id: 'step-unknown',
        type: 'unknown' as any,
        args_json: JSON.stringify({}),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unknown step type: unknown');
    });
  });

  describe('Budget Enforcement', () => {
    it('should enforce token budget limits', async () => {
      // Create a step that would exceed token budget
      const largeStep: Step = {
        id: 'large-step',
        type: 'ocr',
        args_json: 'a'.repeat(50000), // ~12.5k tokens
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(largeStep);
      
      expect(result.isValid).toBe(false);
      expect(result.errors![0]).toContain('Token limit exceeded');
    });

    it('should track budget usage across multiple steps', async () => {
      const step1: Step = {
        id: 'step-1',
        type: 'ocr',
        args_json: JSON.stringify({ text: 'Test', confidence: 0.9 }),
        metadata: { timestamp: Date.now(), depth: 1 }
      };

      const step2: Step = {
        id: 'step-2',
        type: 'ner',
        args_json: JSON.stringify({ entities: [], originalText: 'Test' }),
        metadata: { timestamp: Date.now(), depth: 1 }
      };

      await safetyManager.validateStep(step1);
      await safetyManager.validateStep(step2);

      const budgetStatus = safetyManager.getBudgetStatus();
      expect(budgetStatus.current.tokens).toBeGreaterThan(0);
    });
  });

  describe('Depth Enforcement', () => {
    it('should reject steps exceeding depth limit', async () => {
      const deepStep: Step = {
        id: 'deep-step',
        type: 'ocr',
        args_json: JSON.stringify({ text: 'Test', confidence: 0.9 }),
        metadata: {
          timestamp: Date.now(),
          depth: 10 // exceeds maxDepth of 5
        }
      };

      const result = await safetyManager.validateStep(deepStep);
      
      expect(result.isValid).toBe(false);
      expect(result.errors![0]).toContain('Depth limit exceeded');
    });

    it('should enforce branching limits in batch validation', async () => {
      const steps: Step[] = Array.from({ length: 5 }, (_, i) => ({
        id: `step-${i}`,
        type: 'ocr',
        args_json: JSON.stringify({ text: 'Test', confidence: 0.9 }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      }));

      const results = await safetyManager.validateSteps(steps);
      
      // Should reject all steps if branching limit (3) is exceeded
      results.forEach(result => {
        expect(result.isValid).toBe(false);
        expect(result.errors!.some(error => error.includes('Branching limit exceeded'))).toBe(true);
      });
    });
  });

  describe('Capability Isolation', () => {
    it('should allow permitted capabilities', async () => {
      const step: Step = {
        id: 'allowed-step',
        type: 'custom',
        args_json: JSON.stringify({ action: 'read' }),
        metadata: {
          timestamp: Date.now(),
          depth: 1,
          capabilities: ['file:read:user'] // allowed capability
        }
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(true);
    });

    it('should reject restricted capabilities', async () => {
      const step: Step = {
        id: 'restricted-step',
        type: 'custom',
        args_json: JSON.stringify({ action: 'admin' }),
        metadata: {
          timestamp: Date.now(),
          depth: 1,
          capabilities: ['file:write:system'] // restricted capability
        }
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(false);
      expect(result.errors![0]).toContain('Restricted capabilities');
    });

    it('should warn about capabilities requiring approval', async () => {
      const step: Step = {
        id: 'approval-step',
        type: 'custom',
        args_json: JSON.stringify({ action: 'delete' }),
        metadata: {
          timestamp: Date.now(),
          depth: 1,
          capabilities: ['file:delete:user'] // requires approval
        }
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Capabilities require approval');
    });
  });

  describe('Plan Signature Verification', () => {
    it('should generate and verify valid signatures', () => {
      const plan = { id: 'test-plan', steps: [] };
      const signature = safetyManager.signPlan(plan);
      
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
      
      const isValid = safetyManager.verifyPlanSignature(plan, signature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const plan = { id: 'test-plan', steps: [] };
      const invalidSignature = 'invalid-signature';
      
      const isValid = safetyManager.verifyPlanSignature(plan, invalidSignature);
      expect(isValid).toBe(false);
    });

    it('should detect plan tampering', () => {
      const originalPlan = { id: 'test-plan', steps: [] };
      const signature = safetyManager.signPlan(originalPlan);
      
      const tamperedPlan = { id: 'test-plan', steps: [{ id: 'malicious' }] };
      const isValid = safetyManager.verifyPlanSignature(tamperedPlan, signature);
      
      expect(isValid).toBe(false);
    });

    it('should throw error when signature not configured', () => {
      const configWithoutSignature = {
        ...config,
        signature: undefined
      };
      
      const managerWithoutSignature = new SafetyManager(configWithoutSignature);
      
      expect(() => {
        managerWithoutSignature.signPlan({ test: 'plan' });
      }).toThrow('Signature generation not configured');
    });
  });

  describe('Configuration Updates', () => {
    it('should update budget limits', () => {
      const newLimits = {
        maxTokens: 20000,
        maxCost: 20
      };

      safetyManager.updateConfig({ budgetLimits: newLimits });
      
      const status = safetyManager.getBudgetStatus();
      expect(status.limits.maxTokens).toBe(20000);
      expect(status.limits.maxCost).toBe(20);
    });

    it('should update depth limits', () => {
      const newDepthLimits = {
        maxDepth: 8,
        maxBranching: 5
      };

      safetyManager.updateConfig({ depthLimits: newDepthLimits });
      
      const stats = safetyManager.getStats();
      // Test that new limits are applied in subsequent validations
    });

    it('should update capability configuration', () => {
      const newCapabilities = {
        allowed: ['new:capability'],
        restricted: ['dangerous:capability'],
        requireApproval: []
      };

      safetyManager.updateConfig({ capabilities: newCapabilities });
      
      const stats = safetyManager.getStats();
      expect(stats.capabilities).toBeDefined();
    });
  });

  describe('Custom Validators', () => {
    it('should add custom schema validator', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      };

      expect(() => {
        safetyManager.addCustomValidator('custom', customSchema);
      }).not.toThrow();
    });

    it('should remove custom validator', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      };

      safetyManager.addCustomValidator('custom', customSchema);
      const removed = safetyManager.removeCustomValidator('custom');
      
      expect(removed).toBe(true);
    });

    it('should handle invalid custom schema', () => {
      const invalidSchema = {
        type: 'invalid'
      };

      expect(() => {
        safetyManager.addCustomValidator('invalid', invalidSchema);
      }).toThrow('Failed to compile custom schema');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const step: Step = {
        id: 'error-step',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Test',
          confidence: 'invalid' // should be number
        }),
        metadata: {
          timestamp: Date.now(),
          depth: 1
        }
      };

      const result = await safetyManager.validateStep(step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle missing metadata gracefully', async () => {
      const step: Step = {
        id: 'no-metadata-step',
        type: 'ocr',
        args_json: JSON.stringify({
          text: 'Test',
          confidence: 0.9
        })
        // no metadata
      };

      const result = await safetyManager.validateStep(step);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide comprehensive statistics', () => {
      const stats = safetyManager.getStats();
      
      expect(stats).toHaveProperty('budget');
      expect(stats).toHaveProperty('validation');
      expect(stats).toHaveProperty('capabilities');
      expect(stats).toHaveProperty('depth');
      
      expect(stats.validation.schemasCompiled).toBe(3);
    });

    it('should reset budget when requested', () => {
      safetyManager.resetBudget();
      
      const status = safetyManager.getBudgetStatus();
      expect(status.current.tokens).toBe(0);
      expect(status.current.cost).toBe(0);
    });
  });
});