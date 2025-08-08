// Helper methods for enhanced NER tool - to be integrated
import { createHash } from 'crypto';
import { NEREntity, NERArgs } from '../types/index.js';

export class NEREnhancedMethods {
  /**
   * Preprocess text for better entity extraction
   */
  static preprocessText(text: string, options: NERArgs['options']): string {
    let processed = text;
    
    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // Domain-specific preprocessing
    switch (options.domain) {
      case 'legal':
        // Standardize legal citations
        processed = processed.replace(/U\.S\.C\./gi, 'U.S.C.');
        processed = processed.replace(/C\.F\.R\./gi, 'C.F.R.');
        break;
        
      case 'medical':
        // Standardize medical abbreviations
        processed = processed.replace(/\bDx:\s*/gi, 'Diagnosis: ');
        processed = processed.replace(/\bHx:\s*/gi, 'History: ');
        break;
        
      case 'financial':
        // Standardize financial notation
        processed = processed.replace(/\$([\\d,]+)([KMB])\b/gi, (match, num, suffix) => {
          const multipliers = { K: '000', M: '000000', B: '000000000' };
          return `$${num}${multipliers[suffix as keyof typeof multipliers]}`;
        });
        break;
    }
    
    return processed;
  }

  /**
   * Generate cache key based on text and options
   */
  static generateCacheKey(text: string, options: NERArgs['options']): string {
    const textHash = createHash('md5').update(text).digest('hex').substring(0, 16);
    const optionsHash = createHash('md5').update(JSON.stringify({
      domain: options.domain,
      extractPersons: options.extractPersons,
      extractOrganizations: options.extractOrganizations,
      extractPlaces: options.extractPlaces,
      extractDates: options.extractDates,
      extractNumbers: options.extractNumbers,
      confidenceThreshold: options.confidenceThreshold,
      customEntities: options.customEntities
    })).digest('hex').substring(0, 8);
    
    return `ner:${textHash}:${optionsHash}`;
  }

  /**
   * Generate domain-specific cache key
   */
  static generateDomainCacheKey(text: string, options: NERArgs['options']): string {
    const baseKey = this.generateCacheKey(text, options);
    const domainConfigHash = options.domainConfig 
      ? createHash('md5').update(JSON.stringify(options.domainConfig)).digest('hex').substring(0, 8)
      : 'none';
    
    return `${baseKey}:${options.domain}:${domainConfigHash}`;
  }

  /**
   * Find entity occurrences with context
   */
  static findEntityOccurrences(
    text: string, 
    entity: string, 
    contextWindow: number
  ): Array<{ start: number; end: number; context: string }> {
    const occurrences = [];
    const regex = new RegExp(entity.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + entity.length;
      const contextStart = Math.max(0, start - contextWindow);
      const contextEnd = Math.min(text.length, end + contextWindow);
      const context = text.substring(contextStart, contextEnd);
      
      occurrences.push({ start, end, context });
    }
    
    return occurrences;
  }

  /**
   * Enhanced confidence calculation with context analysis
   */
  static calculateEnhancedConfidence(
    text: string, 
    label: string, 
    context: string, 
    options: NERArgs['options']
  ): number {
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

    // Context analysis
    const contextScore = this.analyzeContext(text, label, context, options);
    confidence += contextScore;

    // Domain-specific boosts
    if (options.domain !== 'general' && options.domainConfig) {
      const domainConfig = options.domainConfig[options.domain];
      if (domainConfig) {
        confidence += domainConfig.confidenceBoost || 0;
      }
    }

    // Label-specific factors
    switch (label) {
      case 'PERSON':
        if (text.match(/\b(Mr|Mrs|Ms|Dr|Prof)\./i)) confidence += 0.2;
        if (text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+$/)) confidence += 0.1;
        break;
        
      case 'ORGANIZATION':
        if (text.match(/\b(Inc|Corp|LLC|Ltd|Co)\b/i)) confidence += 0.2;
        if (text.match(/\b(Company|Corporation|Association)\b/i)) confidence += 0.15;
        break;
        
      case 'LOCATION':
        if (text.match(/\b(Street|Avenue|Road|City|County|State)\b/i)) confidence += 0.2;
        if (text.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/)) confidence += 0.15;
        break;
        
      case 'DATE':
        confidence += 0.3; // Dates are generally reliable
        break;
        
      case 'NUMBER':
        confidence += 0.25; // Numbers are straightforward
        break;
        
      case 'CUSTOM':
        confidence += 0.1; // Custom patterns baseline
        break;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Analyze context for entity confidence
   */
  static analyzeContext(text: string, label: string, context: string, options: NERArgs['options']): number {
    let contextScore = 0;
    const lowerContext = context.toLowerCase();

    // Look for contextual clues
    const contextClues: Record<string, string[]> = {
      PERSON: ['said', 'told', 'according to', 'by', 'from', 'mr', 'mrs', 'dr'],
      ORGANIZATION: ['company', 'corporation', 'firm', 'agency', 'department', 'office'],
      LOCATION: ['in', 'at', 'from', 'to', 'located', 'based', 'city', 'state', 'country'],
      DATE: ['on', 'during', 'since', 'until', 'before', 'after'],
      NUMBER: ['approximately', 'about', 'over', 'under', 'exactly', '$', '%']
    };

    const clues = contextClues[label] || [];
    const foundClues = clues.filter(clue => lowerContext.includes(clue)).length;
    contextScore += Math.min(foundClues * 0.05, 0.2);

    return contextScore;
  }

  /**
   * Handle overlapping entities based on strategy
   */
  static handleOverlappingEntities(
    entities: NEREntity[], 
    strategy: 'keep-all' | 'highest-confidence' | 'longest-match'
  ): NEREntity[] {
    if (strategy === 'keep-all') {
      return entities;
    }

    // Sort by start position
    const sorted = [...entities].sort((a, b) => a.start - b.start);
    const result: NEREntity[] = [];

    for (const entity of sorted) {
      const overlapping = result.filter(existing => 
        (existing.start <= entity.start && existing.end > entity.start) ||
        (entity.start <= existing.start && entity.end > existing.start)
      );

      if (overlapping.length === 0) {
        result.push(entity);
      } else {
        // Handle overlap based on strategy
        if (strategy === 'highest-confidence') {
          const allCandidates = [...overlapping, entity];
          const best = allCandidates.reduce((prev, current) => 
            current.confidence > prev.confidence ? current : prev
          );
          
          // Remove overlapping entities and add the best one
          overlapping.forEach(overlap => {
            const index = result.indexOf(overlap);
            if (index > -1) result.splice(index, 1);
          });
          result.push(best);
        } else if (strategy === 'longest-match') {
          const allCandidates = [...overlapping, entity];
          const longest = allCandidates.reduce((prev, current) => 
            (current.end - current.start) > (prev.end - prev.start) ? current : prev
          );
          
          // Remove overlapping entities and add the longest one
          overlapping.forEach(overlap => {
            const index = result.indexOf(overlap);
            if (index > -1) result.splice(index, 1);
          });
          result.push(longest);
        }
      }
    }

    return result;
  }

  /**
   * Calculate domain-specific statistics
   */
  static calculateDomainStatistics(entities: NEREntity[], domain: string): Record<string, any> {
    const stats: Record<string, any> = {
      domainEntities: entities.filter(e => e.domain === domain).length,
      labelDistribution: {}
    };

    // Calculate label distribution
    entities.forEach(entity => {
      stats.labelDistribution[entity.label] = (stats.labelDistribution[entity.label] || 0) + 1;
    });

    // Domain-specific metrics
    if (domain === 'legal') {
      stats.caseNumbers = entities.filter(e => e.label.includes('CASE')).length;
      stats.statutes = entities.filter(e => e.label.includes('STATUTE')).length;
      stats.parties = entities.filter(e => e.label.includes('PARTY')).length;
    } else if (domain === 'medical') {
      stats.medications = entities.filter(e => e.label.includes('MEDICATION')).length;
      stats.symptoms = entities.filter(e => e.label.includes('SYMPTOM')).length;
      stats.diagnoses = entities.filter(e => e.label.includes('DIAGNOSIS')).length;
    } else if (domain === 'financial') {
      stats.currencies = entities.filter(e => e.label.includes('CURRENCY')).length;
      stats.tickers = entities.filter(e => e.label.includes('TICKER')).length;
      stats.companies = entities.filter(e => e.label.includes('COMPANY')).length;
    }

    return stats;
  }

  /**
   * Categorize errors for better error handling
   */
  static categorizeError(error: any): string {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('regex') || message.includes('pattern')) {
      return 'pattern';
    }
    if (message.includes('memory') || message.includes('timeout')) {
      return 'resource';
    }
    if (message.includes('domain') || message.includes('config')) {
      return 'configuration';
    }
    if (message.includes('text') || message.includes('input')) {
      return 'input';
    }
    
    return 'unknown';
  }
}