import nlp from 'compromise';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { ToolResult, NERResult, NEREntity, DomainConfig, PerformanceLogger } from '../types/index.js';
import { EnhancedValidator, NERArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { Logger } from '../utils/logger.js';

// Extend compromise with additional plugins
// Note: Import paths for compromise plugins need to be handled differently
const logger = new Logger('NERTool', {
  level: 'info',
  format: 'json',
  logRequests: true,
  logErrors: true,
  logPerformance: true,
  maxLogSize: 10000
});

export class NERTool {
  private static entityCache = new LRUCache<string, NEREntity[]>({
    max: 500,
    ttl: 1000 * 60 * 15 // 15 minutes
  });

  private static domainPatterns: Record<string, Record<string, RegExp[]>> = {
    legal: {
      caseNumbers: [
        /\b(?:Case|Docket)\s+No\.?\s*[:#]?\s*([A-Z0-9-]+(?:\([A-Z0-9]+\))?)/gi,
        /\b(\d{1,2}[-:]\d{4}[-:]cv[-:]\d+)/gi,
        /\b([A-Z]{1,3}\d{4,8})/g
      ],
      statutes: [
        /\b(\d+\s+U\.?S\.?C\.?\s*§\s*\d+(?:\.\d+)*)/gi,
        /\b(\d+\s+C\.?F\.?R\.?\s*§\s*\d+(?:\.\d+)*)/gi,
        /\bSection\s+(\d+(?:\.\d+)*)/gi
      ],
      parties: [
        /\b([A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)*(?:Inc\.|Corp\.|LLC|Ltd\.|Co\.))\s+v\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /\bPlaintiff(?:s)?[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /\bDefendant(?:s)?[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
      ]
    },
    medical: {
      medications: [
        /\b([A-Z][a-z]+(?:mab|nib|zole|pril|sartan|statin))\b/gi,
        /\b(acetaminophen|ibuprofen|aspirin|metformin|lisinopril|atorvastatin|metoprolol|amlodipine|omeprazole|levothyroxine)\b/gi
      ],
      symptoms: [
        /\b(chest pain|shortness of breath|nausea|vomiting|dizziness|headache|fatigue|fever|cough|abdominal pain)\b/gi,
        /\b(hypertension|diabetes|asthma|depression|anxiety|COPD|CHF|MI|CVA|DVT)\b/gi
      ],
      diagnoses: [
        /\b([A-Z]\d{2}(?:\.\d{1,3})?)[\s-]([A-Za-z\s,]+)/g, // ICD codes
        /\b(Type [12] diabetes|myocardial infarction|congestive heart failure|chronic obstructive pulmonary disease)\b/gi
      ]
    },
    financial: {
      currencies: [
        /\$([\d,]+(?:\.\d{2})?)/g,
        /\b(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(USD|EUR|GBP|JPY|CAD)/gi
      ],
      tickers: [
        /\b([A-Z]{1,5})\s*(?:stock|shares?|equity)/gi,
        /\$([A-Z]{1,5})\b/g
      ],
      companies: [
        /\b([A-Z][a-zA-Z\s&]+(?:Inc\.|Corp\.|LLC|Ltd\.|Co\.|Corporation|Company|Group))\b/g,
        /\b(Apple|Microsoft|Amazon|Google|Facebook|Tesla|Berkshire Hathaway|JPMorgan|Bank of America)\b/gi
      ]
    }
  };

  /**
   * Performs Named Entity Recognition with domain-specific enhancements
   */
  static async execute(args: unknown): Promise<ToolResult<NERResult>> {
    const perfLogger = new PerformanceLogger('NER');
    
    try {
      // Enhanced argument validation
      const validation = EnhancedValidator.validateNERArgs(args);
      if (!validation.valid) {
        return EnhancedValidator.createErrorResponse(validation.errors, 'NER');
      }

      const { text, options } = validation.data!;
      
      // Enhanced caching with domain-specific keys
      const cacheKey = options.domain !== 'general' 
        ? this.generateDomainCacheKey(text, options)
        : this.generateCacheKey(text, options);
        
      const cached = this.entityCache.get(cacheKey);
      if (cached) {
        const processingTime = perfLogger.end(true, { cached: true });
        logger.info('NER result retrieved from cache', { 
          cacheKey: cacheKey.substring(0, 16) + '...', 
          entityCount: cached.length 
        });
        
        return {
          success: true,
          data: {
            entities: cached,
            totalEntities: cached.length,
            processingStats: {
              wordsProcessed: text.split(/\s+/).length,
              entitiesFound: cached.length,
              averageConfidence: cached.reduce((sum, entity) => sum + entity.confidence, 0) / cached.length
            }
          },
          metadata: {
            processingTime,
            costEstimate: { tokens: 0, computeUnits: 0, estimatedDurationMs: 0, complexity: 'low' },
            confidence: cached.reduce((sum, entity) => sum + entity.confidence, 0) / cached.length
          }
        };
      }
      
      // Accurate cost estimation
      const costEstimate = CostEstimator.estimateNER(text.length, options);

      logger.info('Starting NER processing', { 
        textLength: text.length,
        options,
        costEstimate 
      });

      // Enhanced text processing with preprocessing
      const preprocessedText = this.preprocessText(text, options);
      const doc = nlp(preprocessedText);
      let entities: NEREntity[] = [];
      
      // Domain-specific entity extraction
      if (options.domain !== 'general' && options.domainConfig) {
        const domainEntities = await this.extractDomainSpecificEntities(
          preprocessedText, 
          options.domain, 
          options.domainConfig[options.domain]
        );
        entities.push(...domainEntities);
        
        logger.debug('Domain-specific entities extracted', { 
          domain: options.domain, 
          count: domainEntities.length 
        });
      }

      // Enhanced person extraction with context analysis
      if (options.extractPersons) {
        const people = doc.people().out('array');
        for (const person of people) {
          const matches = this.findEntityOccurrences(preprocessedText, person, options.contextWindow);
          
          for (const match of matches) {
            const confidence = this.calculateEnhancedConfidence(
              person, 
              'PERSON', 
              match.context, 
              options
            );
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: person,
                label: 'PERSON',
                start: match.start,
                end: match.end,
                confidence,
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
      }

      if (options.extractOrganizations) {
        const orgs = doc.organizations().out('array');
        for (const org of orgs) {
          const matches = this.findEntityOccurrences(preprocessedText, org, options.contextWindow);
          
          for (const match of matches) {
            const confidence = this.calculateEnhancedConfidence(
              org, 
              'ORGANIZATION', 
              match.context, 
              options
            );
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: org,
                label: 'ORGANIZATION',
                start: match.start,
                end: match.end,
                confidence,
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
      }

      if (options.extractPlaces) {
        const places = doc.places().out('array');
        for (const place of places) {
          const matches = this.findEntityOccurrences(preprocessedText, place, options.contextWindow);
          
          for (const match of matches) {
            const confidence = this.calculateEnhancedConfidence(
              place, 
              'LOCATION', 
              match.context, 
              options
            );
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: place,
                label: 'LOCATION',
                start: match.start,
                end: match.end,
                confidence,
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
      }

      if (options.extractDates) {
        // Enhanced date extraction with multiple patterns
        const datePatterns = [
          /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
          /\b(\d{4}[-]\d{1,2}[-]\d{1,2})\b/g,
          /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
          /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi
        ];
        
        for (const pattern of datePatterns) {
          let match;
          while ((match = pattern.exec(preprocessedText)) !== null) {
            const dateText = match[1];
            const confidence = this.calculateEnhancedConfidence(
              dateText,
              'DATE',
              preprocessedText.substring(Math.max(0, match.index - options.contextWindow), 
                                      Math.min(preprocessedText.length, match.index + dateText.length + options.contextWindow)),
              options
            );
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: dateText,
                label: 'DATE',
                start: match.index,
                end: match.index + dateText.length,
                confidence,
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
        
        // Also use compromise for additional date detection
        const compromiseDates = doc.dates().out('array');
        for (const date of compromiseDates) {
          const matches = this.findEntityOccurrences(preprocessedText, date, options.contextWindow);
          
          for (const match of matches) {
            const confidence = this.calculateEnhancedConfidence(
              date, 
              'DATE', 
              match.context, 
              options
            ) + 0.2; // Boost compromise.js dates
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: date,
                label: 'DATE',
                start: match.start,
                end: match.end,
                confidence: Math.min(confidence, 1),
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
      }

      if (options.extractNumbers) {
        // Enhanced number extraction with context-aware patterns
        const numberPatterns = [
          /\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\b/g, // Formatted numbers
          /\b(\d+(?:\.\d+)?%?)\b/g, // Percentages and decimals
          /\$([\d,]+(?:\.\d{2})?)\b/g // Currency
        ];
        
        for (const pattern of numberPatterns) {
          let match;
          while ((match = pattern.exec(preprocessedText)) !== null) {
            const numberText = match[1] || match[0];
            const confidence = this.calculateEnhancedConfidence(
              numberText,
              'NUMBER',
              preprocessedText.substring(Math.max(0, match.index - options.contextWindow),
                                      Math.min(preprocessedText.length, match.index + numberText.length + options.contextWindow)),
              options
            );
            
            if (confidence >= options.confidenceThreshold) {
              entities.push({
                text: numberText,
                label: 'NUMBER',
                start: match.index,
                end: match.index + numberText.length,
                confidence,
                domain: options.domain !== 'general' ? options.domain : undefined
              });
            }
          }
        }
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