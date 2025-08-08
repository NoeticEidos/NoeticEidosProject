import { CostEstimate } from '../types/index.js';

export class CostEstimator {
  static estimateOCR(imageSize: number, options: any): CostEstimate {
    // Base costs
    let tokens = Math.ceil(imageSize / 1024) * 10; // ~10 tokens per KB
    let computeUnits = Math.ceil(imageSize / (1024 * 1024)) * 50; // ~50 units per MB
    let estimatedDurationMs = Math.max(1000, imageSize / 1000); // Minimum 1s, +1ms per byte

    // Adjust for complexity
    const complexity = imageSize > 5 * 1024 * 1024 ? 'high' : 
                      imageSize > 1024 * 1024 ? 'medium' : 'low';
    
    const complexityMultiplier = complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1;
    
    tokens *= complexityMultiplier;
    computeUnits *= complexityMultiplier;
    estimatedDurationMs *= complexityMultiplier;

    // Language complexity
    if (options.language && options.language !== 'eng') {
      tokens *= 1.2;
      computeUnits *= 1.1;
    }

    // PSM mode complexity
    if (options.psm >= 10) {
      tokens *= 1.3;
      estimatedDurationMs *= 1.4;
    }

    return {
      tokens: Math.ceil(tokens),
      computeUnits: Math.ceil(computeUnits),
      estimatedDurationMs: Math.ceil(estimatedDurationMs),
      complexity
    };
  }

  static estimateNER(textLength: number, options: any): CostEstimate {
    // Base costs
    let tokens = Math.ceil(textLength / 4); // ~4 chars per token
    let computeUnits = Math.ceil(textLength / 100); // ~100 chars per compute unit
    let estimatedDurationMs = Math.max(100, textLength / 10); // ~10 chars per ms, min 100ms

    // Complexity based on text length and options
    const complexity = textLength > 10000 ? 'high' : 
                      textLength > 1000 ? 'medium' : 'low';
    
    const complexityMultiplier = complexity === 'high' ? 1.8 : complexity === 'medium' ? 1.3 : 1;
    
    tokens *= complexityMultiplier;
    computeUnits *= complexityMultiplier;

    // Additional entity types increase cost
    const entityTypes = [
      options.extractPersons,
      options.extractOrganizations, 
      options.extractPlaces,
      options.extractDates,
      options.extractNumbers
    ].filter(Boolean).length;

    const entityMultiplier = 1 + (entityTypes - 1) * 0.1;
    tokens *= entityMultiplier;
    computeUnits *= entityMultiplier;

    // Custom entities add complexity
    if (options.customEntities?.length > 0) {
      tokens *= 1.2;
      computeUnits *= 1.1;
      estimatedDurationMs *= 1.1;
    }

    return {
      tokens: Math.ceil(tokens),
      computeUnits: Math.ceil(computeUnits),
      estimatedDurationMs: Math.ceil(estimatedDurationMs),
      complexity
    };
  }

  static estimateRouting(routeCount: number, requestComplexity: number): CostEstimate {
    // Base costs - routing is generally lightweight
    let tokens = 10 + routeCount * 2; // Base + routes analysis
    let computeUnits = 5 + Math.ceil(routeCount / 10); // Very lightweight
    let estimatedDurationMs = 50 + routeCount * 5; // Fast processing

    // Request complexity (headers, body, query params)
    const complexityMultiplier = requestComplexity > 10 ? 1.5 : 
                                requestComplexity > 5 ? 1.2 : 1;
    
    tokens *= complexityMultiplier;
    computeUnits *= complexityMultiplier;

    const complexity = routeCount > 100 ? 'high' : 
                      routeCount > 20 ? 'medium' : 'low';

    return {
      tokens: Math.ceil(tokens),
      computeUnits: Math.ceil(computeUnits),
      estimatedDurationMs: Math.ceil(estimatedDurationMs),
      complexity
    };
  }
}