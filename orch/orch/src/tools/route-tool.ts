import { ToolResult, RouteDecision } from '../types/index.js';
import { SchemaValidator, routeArgsSchema, RouteArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { logger, PerformanceLogger } from '../utils/logger.js';

interface RouteMatch {
  routeId: string;
  score: number;
  matchType: 'exact' | 'pattern' | 'partial';
  matchDetails: {
    pathMatch: boolean;
    methodMatch: boolean;
    headerMatch: boolean;
    queryMatch: boolean;
    bodyMatch: boolean;
  };
}

export class RouteTool {
  private static routeCache = new Map<string, RouteDecision>();

  /**
   * Performs rule-based routing with intelligent matching
   */
  static async execute(args: unknown): Promise<ToolResult<RouteDecision>> {
    const perfLogger = new PerformanceLogger('Routing');
    
    try {
      // Validate arguments
      const validation = SchemaValidator.validate(routeArgsSchema, args);
      if (!validation.valid) {
        return SchemaValidator.createErrorResponse(validation.errors);
      }

      const { request, routes, options } = validation.data!;
      
      // Calculate request complexity for cost estimation
      const requestComplexity = this.calculateRequestComplexity(request);
      const costEstimate = CostEstimator.estimateRouting(routes.length, requestComplexity);

      logger.info('Starting route matching', { 
        requestPath: request.path,
        requestMethod: request.method,
        routeCount: routes.length,
        strategy: options.strategy,
        costEstimate 
      });

      // Check cache if enabled
      const cacheKey = options.enableCaching ? this.generateCacheKey(request, routes) : null;
      if (cacheKey && this.routeCache.has(cacheKey)) {
        const cached = this.routeCache.get(cacheKey)!;
        const processingTime = perfLogger.end(true, { cached: true });
        
        return {
          success: true,
          data: cached,
          metadata: {
            processingTime,
            costEstimate: { ...costEstimate, tokens: 0, computeUnits: 0 },
            confidence: cached.confidence
          }
        };
      }

      // Evaluate all routes
      const matches = await this.evaluateRoutes(request, routes);
      
      // Apply routing strategy
      let selectedMatch: RouteMatch | null = null;
      
      switch (options.strategy) {
        case 'exact-match':
          selectedMatch = this.findExactMatch(matches);
          break;
        case 'pattern-match':
          selectedMatch = this.findBestPatternMatch(matches);
          break;
        case 'priority':
        default:
          selectedMatch = this.findPriorityMatch(matches, routes);
          break;
      }

      // If no match found, try fallback
      if (!selectedMatch && options.fallbackRoute) {
        const fallbackRoute = routes.find(r => r.id === options.fallbackRoute);
        if (fallbackRoute) {
          selectedMatch = {
            routeId: fallbackRoute.id,
            score: 0.3,
            matchType: 'partial',
            matchDetails: {
              pathMatch: false,
              methodMatch: false,
              headerMatch: false,
              queryMatch: false,
              bodyMatch: false
            }
          };
        }
      }

      if (!selectedMatch) {
        const processingTime = perfLogger.end(false, { reason: 'no_match' });
        return {
          success: false,
          error: 'No matching route found',
          metadata: {
            processingTime,
            costEstimate
          }
        };
      }

      // Generate alternatives (top 3 other matches)
      const alternatives = matches
        .filter(m => m.routeId !== selectedMatch!.routeId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(match => ({
          route: match.routeId,
          score: Math.round(match.score * 100) / 100,
          reason: this.generateMatchReason(match)
        }));

      const routeDecision: RouteDecision = {
        selectedRoute: selectedMatch.routeId,
        confidence: Math.round(selectedMatch.score * 100) / 100,
        reasoning: this.generateMatchReason(selectedMatch),
        alternatives
      };

      // Cache result if enabled
      if (cacheKey) {
        this.routeCache.set(cacheKey, routeDecision);
        // Limit cache size
        if (this.routeCache.size > 1000) {
          const firstKey = this.routeCache.keys().next().value;
          this.routeCache.delete(firstKey);
        }
      }

      const processingTime = perfLogger.end(true);

      logger.info('Route matching completed', {
        selectedRoute: routeDecision.selectedRoute,
        confidence: routeDecision.confidence,
        alternativesCount: alternatives.length
      });

      return {
        success: true,
        data: routeDecision,
        metadata: {
          processingTime,
          costEstimate,
          confidence: routeDecision.confidence
        }
      };

    } catch (error) {
      const processingTime = perfLogger.end(false, { error: error.message });
      logger.error('Route matching failed', { error });

      return {
        success: false,
        error: `Route matching failed: ${error.message}`,
        metadata: {
          processingTime,
          costEstimate: CostEstimator.estimateRouting(0, 0)
        }
      };
    }
  }

  private static async evaluateRoutes(
    request: RouteArgs['request'], 
    routes: RouteArgs['routes']
  ): Promise<RouteMatch[]> {
    const matches: RouteMatch[] = [];

    for (const route of routes) {
      const match = await this.evaluateSingleRoute(request, route);
      if (match.score > 0) {
        matches.push(match);
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  private static async evaluateSingleRoute(
    request: RouteArgs['request'],
    route: RouteArgs['routes'][0]
  ): Promise<RouteMatch> {
    let score = 0;
    const matchDetails = {
      pathMatch: false,
      methodMatch: false,
      headerMatch: false,
      queryMatch: false,
      bodyMatch: false
    };

    // Path matching (most important - 50% weight)
    const pathScore = this.evaluatePathMatch(request.path, route.pattern);
    matchDetails.pathMatch = pathScore > 0;
    score += pathScore * 0.5;

    // Method matching (25% weight)
    const methodScore = this.evaluateMethodMatch(request.method, route.methods);
    matchDetails.methodMatch = methodScore > 0;
    score += methodScore * 0.25;

    // Conditions matching (25% weight total)
    if (route.conditions) {
      // Header conditions (10% weight)
      if (route.conditions.headers) {
        const headerScore = this.evaluateHeaderMatch(request.headers, route.conditions.headers);
        matchDetails.headerMatch = headerScore > 0;
        score += headerScore * 0.1;
      }

      // Query conditions (10% weight)
      if (route.conditions.query) {
        const queryScore = this.evaluateQueryMatch(request.query, route.conditions.query);
        matchDetails.queryMatch = queryScore > 0;
        score += queryScore * 0.1;
      }

      // Body conditions (5% weight)
      if (route.conditions.body && request.body) {
        const bodyScore = this.evaluateBodyMatch(request.body, route.conditions.body);
        matchDetails.bodyMatch = bodyScore > 0;
        score += bodyScore * 0.05;
      }
    }

    // Determine match type
    let matchType: 'exact' | 'pattern' | 'partial' = 'partial';
    if (score >= 0.9) matchType = 'exact';
    else if (score >= 0.6) matchType = 'pattern';

    return {
      routeId: route.id,
      score: Math.min(score, 1),
      matchType,
      matchDetails
    };
  }

  private static evaluatePathMatch(requestPath: string, routePattern: string): number {
    // Exact match
    if (requestPath === routePattern) return 1.0;

    // Pattern matching with wildcards
    const patternRegex = routePattern
      .replace(/\*/g, '.*')
      .replace(/:\w+/g, '[^/]+')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${patternRegex}$`);
    if (regex.test(requestPath)) {
      // Score based on specificity
      const wildcards = (routePattern.match(/\*|:\w+/g) || []).length;
      return Math.max(0.8 - wildcards * 0.1, 0.3);
    }

    // Partial match (prefix)
    if (requestPath.startsWith(routePattern) || routePattern.startsWith(requestPath)) {
      const shorter = Math.min(requestPath.length, routePattern.length);
      const longer = Math.max(requestPath.length, routePattern.length);
      return (shorter / longer) * 0.5;
    }

    return 0;
  }

  private static evaluateMethodMatch(requestMethod: string, routeMethods: string[]): number {
    return routeMethods.includes(requestMethod.toUpperCase()) ? 1.0 : 0;
  }

  private static evaluateHeaderMatch(
    requestHeaders: Record<string, string>,
    requiredHeaders: Record<string, string>
  ): number {
    const requiredKeys = Object.keys(requiredHeaders);
    if (requiredKeys.length === 0) return 1.0;

    let matches = 0;
    for (const key of requiredKeys) {
      const requestValue = requestHeaders[key.toLowerCase()] || requestHeaders[key];
      const requiredValue = requiredHeaders[key];

      if (requestValue === requiredValue) {
        matches++;
      } else if (requiredValue === '*' && requestValue) {
        matches += 0.5;
      }
    }

    return matches / requiredKeys.length;
  }

  private static evaluateQueryMatch(
    requestQuery: Record<string, string>,
    requiredQuery: Record<string, string>
  ): number {
    const requiredKeys = Object.keys(requiredQuery);
    if (requiredKeys.length === 0) return 1.0;

    let matches = 0;
    for (const key of requiredKeys) {
      const requestValue = requestQuery[key];
      const requiredValue = requiredQuery[key];

      if (requestValue === requiredValue) {
        matches++;
      } else if (requiredValue === '*' && requestValue) {
        matches += 0.5;
      }
    }

    return matches / requiredKeys.length;
  }

  private static evaluateBodyMatch(requestBody: any, requiredBody: any): number {
    // Simple deep comparison
    try {
      const requestStr = JSON.stringify(requestBody);
      const requiredStr = JSON.stringify(requiredBody);
      
      if (requestStr === requiredStr) return 1.0;
      
      // Check if all required fields are present
      if (typeof requiredBody === 'object' && typeof requestBody === 'object') {
        const requiredKeys = Object.keys(requiredBody);
        let matches = 0;
        
        for (const key of requiredKeys) {
          if (requestBody.hasOwnProperty(key)) {
            matches++;
          }
        }
        
        return matches / requiredKeys.length * 0.7;
      }
    } catch (error) {
      logger.warn('Body comparison failed', { error: error.message });
    }

    return 0;
  }

  private static findExactMatch(matches: RouteMatch[]): RouteMatch | null {
    return matches.find(m => m.matchType === 'exact') || null;
  }

  private static findBestPatternMatch(matches: RouteMatch[]): RouteMatch | null {
    return matches.find(m => m.matchType === 'pattern' || m.matchType === 'exact') || matches[0] || null;
  }

  private static findPriorityMatch(matches: RouteMatch[], routes: RouteArgs['routes']): RouteMatch | null {
    if (matches.length === 0) return null;

    // Sort by score first, then by route priority
    matches.sort((a, b) => {
      const scoreA = a.score;
      const scoreB = b.score;
      
      if (Math.abs(scoreA - scoreB) < 0.1) {
        // Scores are close, use priority
        const routeA = routes.find(r => r.id === a.routeId);
        const routeB = routes.find(r => r.id === b.routeId);
        return (routeB?.priority || 0) - (routeA?.priority || 0);
      }
      
      return scoreB - scoreA;
    });

    return matches[0];
  }

  private static generateMatchReason(match: RouteMatch): string {
    const reasons: string[] = [];
    
    if (match.matchDetails.pathMatch) reasons.push('path match');
    if (match.matchDetails.methodMatch) reasons.push('method match');
    if (match.matchDetails.headerMatch) reasons.push('header conditions');
    if (match.matchDetails.queryMatch) reasons.push('query conditions');
    if (match.matchDetails.bodyMatch) reasons.push('body conditions');

    const reasonText = reasons.length > 0 ? reasons.join(', ') : 'partial match';
    return `${match.matchType} match (${reasonText}) - score: ${Math.round(match.score * 100)}%`;
  }

  private static calculateRequestComplexity(request: RouteArgs['request']): number {
    let complexity = 1;
    
    complexity += Object.keys(request.headers).length * 0.1;
    complexity += Object.keys(request.query).length * 0.1;
    
    if (request.body) {
      try {
        const bodyStr = JSON.stringify(request.body);
        complexity += Math.min(bodyStr.length / 1000, 5);
      } catch {
        complexity += 1;
      }
    }

    return complexity;
  }

  private static generateCacheKey(
    request: RouteArgs['request'], 
    routes: RouteArgs['routes']
  ): string {
    const requestKey = `${request.method}:${request.path}:${JSON.stringify(request.query)}`;
    const routesKey = routes.map(r => `${r.id}:${r.pattern}`).join('|');
    return `${requestKey}#${routesKey}`;
  }

  /**
   * Clear the route cache
   */
  static clearCache(): void {
    this.routeCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.routeCache.size,
      maxSize: 1000
    };
  }
}