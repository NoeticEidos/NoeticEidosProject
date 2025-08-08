import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { ToolResult, RouteDecision, BusinessConstraints, RulesetConfig, PerformanceLogger } from '../types/index.js';
import { EnhancedValidator, RouteArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('RouteTool', {
  level: 'info',
  format: 'json',
  logRequests: true,
  logErrors: true,
  logPerformance: true,
  maxLogSize: 10000
});

interface RouteMatch {
  routeId: string;
  score: number;
  matchType: 'exact' | 'pattern' | 'partial';
  weight: number;
  matchDetails: {
    pathMatch: boolean;
    methodMatch: boolean;
    headerMatch: boolean;
    queryMatch: boolean;
    bodyMatch: boolean;
    customConditions: boolean;
  };
  businessScore?: number;
  riskAssessment?: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
}

interface RuleEngineContext {
  request: RouteArgs['request'];
  routes: RouteArgs['routes'];
  businessConstraints?: BusinessConstraints;
  rulesetConfig?: RulesetConfig;
  timestamp: number;
  requestId: string;
}

export class RouteTool {
  private static routeCache = new LRUCache<string, RouteDecision>({
    max: 2000,
    ttl: 1000 * 60 * 60 // 1 hour default
  });
  
  private static ruleEngineCache = new LRUCache<string, RouteMatch[]>({
    max: 500,
    ttl: 1000 * 60 * 10 // 10 minutes
  });
  
  private static performanceMetrics = new Map<string, {
    avgLatency: number;
    successRate: number;
    lastUpdated: number;
    requestCount: number;
  }>();

  /**
   * Performs advanced rule-based routing with business constraint support
   */
  static async execute(args: unknown): Promise<ToolResult<RouteDecision>> {
    const perfLogger = new PerformanceLogger('Routing');
    const requestId = this.generateRequestId();
    
    try {
      // Enhanced argument validation
      const validation = EnhancedValidator.validateRouteArgs(args);
      if (!validation.valid) {
        return EnhancedValidator.createErrorResponse(validation.errors, 'Routing');
      }

      const { request, routes, options } = validation.data!;
      
      // Create rule engine context
      const context: RuleEngineContext = {
        request,
        routes,
        businessConstraints: options.businessConstraints,
        rulesetConfig: options.rulesetConfig,
        timestamp: Date.now(),
        requestId
      };
      
      // Enhanced request analysis
      const requestComplexity = CostEstimator.calculateRequestComplexity(request);
      const costEstimate = CostEstimator.estimateRouting(routes.length, requestComplexity, options);
      
      // Risk assessment for business constraints
      const riskAssessment = this.assessRequestRisk(request, context);

      logger.info('Starting route matching', { 
        requestPath: request.path,
        requestMethod: request.method,
        routeCount: routes.length,
        strategy: options.strategy,
        costEstimate 
      });

      // Enhanced caching with TTL and strategy support
      let cacheKey: string | null = null;
      if (options.enableCaching) {
        const ttl = this.getCacheTTL(options.cacheStrategy, options.cacheTTL);
        cacheKey = this.generateAdvancedCacheKey(context);
        
        // Check cache with validation
        const cached = this.getFromCache(cacheKey, options.cacheStrategy);
        if (cached && this.validateCachedResult(cached, context)) {
          const processingTime = perfLogger.end(true, { cached: true, cacheStrategy: options.cacheStrategy });
          
          logger.info('Route decision retrieved from cache', { 
            cacheKey: cacheKey.substring(0, 16) + '...', 
            strategy: options.cacheStrategy,
            confidence: cached.confidence 
          });
          
          return {
            success: true,
            data: cached,
            metadata: {
              processingTime,
              costEstimate: { ...costEstimate, tokens: 0, computeUnits: 0 },
              confidence: cached.confidence,
              cached: true
            }
          };
        }
      }

      // Advanced rule engine evaluation
      const matches = await this.executeRuleEngine(context);
      
      // Enhanced route selection with business constraints
      let selectedMatch: RouteMatch | null = null;
      
      if (options.businessConstraints) {
        selectedMatch = this.selectRouteWithBusinessConstraints(matches, context);
      } else {
        selectedMatch = this.selectRouteByStrategy(matches, options.strategy, routes);
      }

      // Enhanced fallback handling with ruleset support
      if (!selectedMatch) {
        selectedMatch = this.handleFallback(context, matches);
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

      // Enhanced alternatives with business impact analysis
      const alternatives = this.generateAlternatives(matches, selectedMatch!, context);

      const routeDecision: RouteDecision = {
        selectedRoute: selectedMatch.routeId,
        confidence: Math.round(selectedMatch.score * 100) / 100,
        reasoning: this.generateAdvancedReasoning(selectedMatch, context),
        alternatives,
        businessConstraints: this.generateBusinessConstraintsInfo(selectedMatch, context)
      };

      // Enhanced caching with strategy support
      if (cacheKey && options.enableCaching) {
        await this.storeToCache(cacheKey, routeDecision, options.cacheStrategy, context);
      }
      
      // Update performance metrics
      this.updatePerformanceMetrics(selectedMatch.routeId, perfLogger.getMetrics());

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
      logger.error('Route matching failed', error, { 
        requestPath: args && typeof args === 'object' && 'request' in args ? (args as any).request?.path : 'unknown',
        routeCount: args && typeof args === 'object' && 'routes' in args ? (args as any).routes?.length : 0,
        requestId
      });

      // Enhanced error categorization
      const errorCategory = this.categorizeError(error);
      
      return {
        success: false,
        error: `Route matching failed (${errorCategory}): ${error.message}`,
        metadata: {
          processingTime,
          costEstimate: CostEstimator.estimateRouting(0, 0, {}),
          errorCategory,
          retryable: ['resource', 'cache'].includes(errorCategory),
          requestId
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