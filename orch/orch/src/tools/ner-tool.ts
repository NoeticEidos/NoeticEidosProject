import nlp from 'compromise';
import { ToolResult, NERResult, NEREntity } from '../types/index.js';
import { SchemaValidator, nerArgsSchema, NERArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { logger, PerformanceLogger } from '../utils/logger.js';

// Extend compromise with additional plugins
import compromiseDates from 'compromise/plugins/dates';
import compromiseNumbers from 'compromise/plugins/numbers';

nlp.extend(compromiseDates);
nlp.extend(compromiseNumbers);

export class NERTool {
  /**
   * Performs Named Entity Recognition using compromise.js with confidence scoring
   */
  static async execute(args: unknown): Promise<ToolResult<NERResult>> {
    const perfLogger = new PerformanceLogger('NER');
    
    try {
      // Validate arguments
      const validation = SchemaValidator.validate(nerArgsSchema, args);
      if (!validation.valid) {
        return SchemaValidator.createErrorResponse(validation.errors);
      }

      const { text, options } = validation.data!;
      
      // Estimate costs
      const costEstimate = CostEstimator.estimateNER(text.length, options);

      logger.info('Starting NER processing', { 
        textLength: text.length,
        options,
        costEstimate 
      });

      // Process text with compromise
      const doc = nlp(text);
      const entities: NEREntity[] = [];

      // Extract different entity types based on options
      if (options.extractPersons) {
        const people = doc.people().out('array');
        people.forEach((person: string, index: number) => {
          const match = doc.match(person);
          if (match.found) {
            const confidence = this.calculateConfidence(person, 'PERSON');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: person,
                label: 'PERSON',
                start: match.offset().start,
                end: match.offset().start + person.length,
                confidence
              });
            }
          }
        });
      }

      if (options.extractOrganizations) {
        const orgs = doc.organizations().out('array');
        orgs.forEach((org: string) => {
          const match = doc.match(org);
          if (match.found) {
            const confidence = this.calculateConfidence(org, 'ORGANIZATION');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: org,
                label: 'ORGANIZATION',
                start: match.offset().start,
                end: match.offset().start + org.length,
                confidence
              });
            }
          }
        });
      }

      if (options.extractPlaces) {
        const places = doc.places().out('array');
        places.forEach((place: string) => {
          const match = doc.match(place);
          if (match.found) {
            const confidence = this.calculateConfidence(place, 'LOCATION');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: place,
                label: 'LOCATION',
                start: match.offset().start,
                end: match.offset().start + place.length,
                confidence
              });
            }
          }
        });
      }

      if (options.extractDates) {
        const dates = doc.dates().out('array');
        dates.forEach((date: string) => {
          const match = doc.match(date);
          if (match.found) {
            const confidence = this.calculateConfidence(date, 'DATE');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: date,
                label: 'DATE',
                start: match.offset().start,
                end: match.offset().start + date.length,
                confidence
              });
            }
          }
        });
      }

      if (options.extractNumbers) {
        const numbers = doc.numbers().out('array');
        numbers.forEach((number: string) => {
          const match = doc.match(number);
          if (match.found) {
            const confidence = this.calculateConfidence(number, 'NUMBER');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: number,
                label: 'NUMBER',
                start: match.offset().start,
                end: match.offset().start + number.length,
                confidence
              });
            }
          }
        });
      }

      // Extract custom entities
      if (options.customEntities.length > 0) {
        options.customEntities.forEach((entityPattern: string) => {
          const regex = new RegExp(entityPattern, 'gi');
          let match;
          while ((match = regex.exec(text)) !== null) {
            const confidence = this.calculateConfidence(match[0], 'CUSTOM');
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: match[0],
                label: 'CUSTOM',
                start: match.index,
                end: match.index + match[0].length,
                confidence
              });
            }
          }
        });
      }

      // Remove duplicates and sort by position
      const uniqueEntities = this.removeDuplicateEntities(entities);
      uniqueEntities.sort((a, b) => a.start - b.start);

      // Calculate processing stats
      const wordsProcessed = doc.terms().length;
      const entitiesFound = uniqueEntities.length;
      const averageConfidence = entitiesFound > 0 
        ? uniqueEntities.reduce((sum, entity) => sum + entity.confidence, 0) / entitiesFound
        : 0;

      const nerResult: NERResult = {
        entities: uniqueEntities,
        totalEntities: entitiesFound,
        processingStats: {
          wordsProcessed,
          entitiesFound,
          averageConfidence
        }
      };

      const processingTime = perfLogger.end(true);

      logger.info('NER processing completed', {
        entitiesFound,
        averageConfidence: Math.round(averageConfidence * 100) / 100,
        wordsProcessed
      });

      return {
        success: true,
        data: nerResult,
        metadata: {
          processingTime,
          costEstimate,
          confidence: averageConfidence
        }
      };

    } catch (error) {
      const processingTime = perfLogger.end(false, { error: error.message });
      logger.error('NER processing failed', { error });

      return {
        success: false,
        error: `NER processing failed: ${error.message}`,
        metadata: {
          processingTime,
          costEstimate: CostEstimator.estimateNER(0, {})
        }
      };
    }
  }

  /**
   * Calculate confidence score for an entity based on various factors
   */
  private static calculateConfidence(text: string, label: string): number {
    let confidence = 0.5; // Base confidence

    // Length factor - longer entities tend to be more reliable
    const lengthFactor = Math.min(text.length / 20, 1) * 0.2;
    confidence += lengthFactor;

    // Capitalization factor - proper nouns are more likely to be entities
    const capitalizedWords = text.split(' ').filter(word => 
      word.length > 0 && word[0] === word[0].toUpperCase()
    ).length;
    const capitalizationFactor = (capitalizedWords / text.split(' ').length) * 0.2;
    confidence += capitalizationFactor;

    // Label-specific factors
    switch (label) {
      case 'PERSON':
        // Check for common person indicators
        if (text.match(/\b(Mr|Mrs|Ms|Dr|Prof)\./i)) confidence += 0.2;
        if (text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+$/)) confidence += 0.1;
        break;
        
      case 'ORGANIZATION':
        // Check for organization indicators
        if (text.match(/\b(Inc|Corp|LLC|Ltd|Co)\b/i)) confidence += 0.2;
        if (text.match(/\b(Company|Corporation|Association)\b/i)) confidence += 0.15;
        break;
        
      case 'LOCATION':
        // Check for location indicators
        if (text.match(/\b(Street|Avenue|Road|City|County|State)\b/i)) confidence += 0.2;
        if (text.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/)) confidence += 0.15;
        break;
        
      case 'DATE':
        // Dates from compromise are generally reliable
        confidence += 0.3;
        break;
        
      case 'NUMBER':
        // Numbers are straightforward
        confidence += 0.25;
        break;
        
      case 'CUSTOM':
        // Custom patterns are as reliable as their regex
        confidence += 0.1;
        break;
    }

    // Ensure confidence is between 0 and 1
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Remove duplicate entities that overlap or are identical
   */
  private static removeDuplicateEntities(entities: NEREntity[]): NEREntity[] {
    const result: NEREntity[] = [];
    
    for (const entity of entities) {
      const isDuplicate = result.some(existing => 
        // Same text and label
        (existing.text === entity.text && existing.label === entity.label) ||
        // Overlapping positions
        (existing.start <= entity.start && existing.end >= entity.end) ||
        (entity.start <= existing.start && entity.end >= existing.end)
      );
      
      if (!isDuplicate) {
        result.push(entity);
      } else {
        // Keep the one with higher confidence
        const existingIndex = result.findIndex(existing => 
          (existing.start <= entity.start && existing.end >= entity.end) ||
          (entity.start <= existing.start && entity.end >= existing.end)
        );
        
        if (existingIndex >= 0 && entity.confidence > result[existingIndex].confidence) {
          result[existingIndex] = entity;
        }
      }
    }
    
    return result;
  }
}