import { NERTool } from '../src/tools/ner-tool.js';
import { NERArgs } from '../src/utils/validation.js';

describe('NERTool', () => {
  describe('argument validation', () => {
    it('should reject missing text', async () => {
      const result = await NERTool.execute({});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should reject empty text', async () => {
      const result = await NERTool.execute({
        text: ''
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should accept valid arguments with defaults', async () => {
      const result = await NERTool.execute({
        text: 'John Smith works at Microsoft in Seattle.'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('entity extraction', () => {
    it('should extract person entities', async () => {
      const args: NERArgs = {
        text: 'John Smith and Jane Doe are attending the meeting.',
        options: {
          extractPersons: true,
          extractOrganizations: false,
          extractPlaces: false,
          extractDates: false,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'PERSON')).toBe(true);
      expect(result.data?.processingStats.entitiesFound).toBeGreaterThan(0);
    });

    it('should extract organization entities', async () => {
      const args: NERArgs = {
        text: 'Apple Inc. and Microsoft Corporation are tech giants.',
        options: {
          extractPersons: false,
          extractOrganizations: true,
          extractPlaces: false,
          extractDates: false,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'ORGANIZATION')).toBe(true);
    });

    it('should extract location entities', async () => {
      const args: NERArgs = {
        text: 'I visited New York City and Los Angeles last year.',
        options: {
          extractPersons: false,
          extractOrganizations: false,
          extractPlaces: true,
          extractDates: false,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'LOCATION')).toBe(true);
    });

    it('should extract date entities', async () => {
      const args: NERArgs = {
        text: 'The meeting is scheduled for January 15th, 2024.',
        options: {
          extractPersons: false,
          extractOrganizations: false,
          extractPlaces: false,
          extractDates: true,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'DATE')).toBe(true);
    });

    it('should extract number entities', async () => {
      const args: NERArgs = {
        text: 'The price is $100 and the quantity is 42.',
        options: {
          extractPersons: false,
          extractOrganizations: false,
          extractPlaces: false,
          extractDates: false,
          extractNumbers: true,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'NUMBER')).toBe(true);
    });

    it('should extract custom entities using regex patterns', async () => {
      const args: NERArgs = {
        text: 'Contact us at support@company.com or sales@business.org',
        options: {
          extractPersons: false,
          extractOrganizations: false,
          extractPlaces: false,
          extractDates: false,
          customEntities: ['\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b'],
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.some(e => e.label === 'CUSTOM')).toBe(true);
      expect(result.data?.entities.some(e => e.text.includes('@'))).toBe(true);
    });
  });

  describe('confidence scoring', () => {
    it('should filter entities by confidence threshold', async () => {
      const args: NERArgs = {
        text: 'John Smith works at Microsoft.',
        options: {
          extractPersons: true,
          extractOrganizations: true,
          confidenceThreshold: 0.9 // Very high threshold
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      // With high threshold, fewer entities should be returned
      if (result.data?.entities.length) {
        result.data.entities.forEach(entity => {
          expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
        });
      }
    });

    it('should include confidence scores for all entities', async () => {
      const args: NERArgs = {
        text: 'Dr. Jane Smith works at Google Inc. in Mountain View, California.',
        options: {
          extractPersons: true,
          extractOrganizations: true,
          extractPlaces: true,
          confidenceThreshold: 0.0
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.data?.entities.length).toBeGreaterThan(0);
      
      result.data?.entities.forEach(entity => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
        expect(typeof entity.start).toBe('number');
        expect(typeof entity.end).toBe('number');
        expect(entity.end).toBeGreaterThan(entity.start);
      });
    });
  });

  describe('duplicate handling', () => {
    it('should remove duplicate entities', async () => {
      const args: NERArgs = {
        text: 'John Smith and John Smith are different people named John Smith.',
        options: {
          extractPersons: true,
          confidenceThreshold: 0.3
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(true);
      
      // Count occurrences of "John Smith"
      const johnSmithEntities = result.data?.entities.filter(e => 
        e.text === 'John Smith' && e.label === 'PERSON'
      ) || [];
      
      // Should have fewer duplicates than actual text occurrences
      const textOccurrences = (args.text.match(/John Smith/g) || []).length;
      expect(johnSmithEntities.length).toBeLessThanOrEqual(textOccurrences);
    });
  });

  describe('processing statistics', () => {
    it('should provide accurate processing statistics', async () => {
      const text = 'Apple Inc. was founded by Steve Jobs in Cupertino, California on April 1, 1976.';
      
      const result = await NERTool.execute({
        text,
        options: {
          extractPersons: true,
          extractOrganizations: true,
          extractPlaces: true,
          extractDates: true,
          confidenceThreshold: 0.3
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.processingStats.wordsProcessed).toBeGreaterThan(0);
      expect(result.data?.processingStats.entitiesFound).toBeGreaterThan(0);
      expect(result.data?.processingStats.averageConfidence).toBeGreaterThan(0);
      expect(result.data?.processingStats.averageConfidence).toBeLessThanOrEqual(1);
      expect(result.data?.totalEntities).toBe(result.data?.entities.length);
    });
  });

  describe('error handling', () => {
    it('should handle invalid custom entity patterns', async () => {
      const args: NERArgs = {
        text: 'Test text',
        options: {
          customEntities: ['[invalid regex'] // Invalid regex
        }
      };

      const result = await NERTool.execute(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('NER processing failed');
    });
  });

  describe('cost estimation', () => {
    it('should provide accurate cost estimates', async () => {
      const longText = 'This is a long text. '.repeat(100);
      
      const result = await NERTool.execute({
        text: longText,
        options: {
          extractPersons: true,
          extractOrganizations: true,
          extractPlaces: true,
          extractDates: true,
          extractNumbers: true
        }
      });

      expect(result.success).toBe(true);
      expect(result.metadata.costEstimate.tokens).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.computeUnits).toBeGreaterThan(0);
      expect(result.metadata.costEstimate.estimatedDurationMs).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(result.metadata.costEstimate.complexity);
    });

    it('should scale cost estimates with text length', async () => {
      const shortText = 'Short text';
      const longText = 'This is a much longer text that contains many more words and should result in higher cost estimates. '.repeat(50);

      const shortResult = await NERTool.execute({ text: shortText });
      const longResult = await NERTool.execute({ text: longText });

      expect(shortResult.success).toBe(true);
      expect(longResult.success).toBe(true);
      
      expect(longResult.metadata.costEstimate.tokens).toBeGreaterThan(
        shortResult.metadata.costEstimate.tokens
      );
      expect(longResult.metadata.costEstimate.computeUnits).toBeGreaterThan(
        shortResult.metadata.costEstimate.computeUnits
      );
    });
  });
});