import { createWorker, PSM, OEM } from 'tesseract.js';
import sharp from 'sharp';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { ToolResult, OCRResult, CASIntegration, PerformanceLogger } from '../types/index.js';
import { EnhancedValidator, OCRArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('OCRTool', {
  level: 'info',
  format: 'json',
  logRequests: true,
  logErrors: true,
  logPerformance: true,
  maxLogSize: 10000
});

export class OCRTool {
  private static worker: any = null;
  private static casCache = new LRUCache<string, OCRResult>({
    max: 1000,
    ttl: 1000 * 60 * 60 // 1 hour
  });
  private static preprocessingCache = new LRUCache<string, Buffer>({
    max: 100,
    ttl: 1000 * 60 * 30 // 30 minutes
  });

  /**
   * Performs OCR on an image with optional CAS integration and enhanced preprocessing
   */
  static async execute(args: unknown): Promise<ToolResult<OCRResult>> {
    const perfLogger = new PerformanceLogger('OCR');
    
    try {
      // Enhanced argument validation
      const validation = EnhancedValidator.validateOCRArgs(args);
      if (!validation.valid) {
        return EnhancedValidator.createErrorResponse(validation.errors, 'OCR');
      }

      const { imageUrl, imageBuffer, options, casIntegration } = validation.data!;
      
      // Enhanced image preprocessing and validation
      let processedImageBuffer = imageBuffer;
      let actualImageSize = imageBuffer?.length || 0;
      
      if (!processedImageBuffer && imageUrl) {
        processedImageBuffer = await this.loadImageFromUrl(imageUrl);
        actualImageSize = processedImageBuffer.length;
      }
      
      // Image preprocessing with caching
      if (options.preprocessingEnabled && processedImageBuffer) {
        const preprocessKey = this.generatePreprocessKey(processedImageBuffer, options);
        let cached = this.preprocessingCache.get(preprocessKey);
        
        if (!cached) {
          cached = await this.preprocessImage(processedImageBuffer, options);
          this.preprocessingCache.set(preprocessKey, cached);
          logger.info('Image preprocessed and cached', { 
            originalSize: actualImageSize, 
            processedSize: cached.length 
          });
        } else {
          logger.info('Using cached preprocessed image', { preprocessKey });
        }
        
        processedImageBuffer = cached;
        actualImageSize = cached.length;
      }
      
      // Accurate cost estimation based on processed image
      const costEstimate = CostEstimator.estimateOCR(actualImageSize, options);

      logger.info('Starting OCR processing', { 
        imageSize, 
        options,
        costEstimate 
      });

      // Enhanced CAS cache with integrity checking
      if (casIntegration.enabled) {
        const imageHash = this.generateImageHash(processedImageBuffer);
        const cacheKey = casIntegration.checksumValidation ? imageHash : imageUrl || 'buffer';
        
        const cachedResult = await this.checkCASCache(cacheKey, casIntegration);
        if (cachedResult) {
          // Validate cache integrity if enabled
          if (casIntegration.checksumValidation && !this.validateCacheIntegrity(cachedResult, imageHash)) {
            logger.warn('Cache integrity validation failed, proceeding with fresh OCR');
          } else {
            const processingTime = perfLogger.end(true, { cached: true, cacheKey });
            logger.info('OCR result retrieved from cache', { 
              cacheKey, 
              confidence: cachedResult.confidence 
            });
            
            return {
              success: true,
              data: { ...cachedResult, pageRef: cacheKey },
              metadata: {
                processingTime,
                costEstimate: { ...costEstimate, tokens: 0, computeUnits: 0 },
                confidence: cachedResult.confidence
              }
            };
          }
        }
      }

      // Initialize Tesseract worker with enhanced configuration
      const worker = await this.getWorker(options.language || 'eng');
      
      // Quality vs Speed configuration
      const tesseractParams = this.buildTesseractParams(options);
      await worker.setParameters(tesseractParams);
      
      logger.debug('Tesseract configured', { params: tesseractParams, language: options.language });

      // Perform OCR with enhanced error handling and retries
      let ocrData;
      const maxRetries = 3;
      let lastError;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const recognizeOptions = {
            lang: options.language || 'eng',
            ...(options.rotationCorrection && { rotateAuto: true })
          };
          
          logger.debug(`OCR attempt ${attempt}`, { recognizeOptions });
          
          const result = await worker.recognize(processedImageBuffer, recognizeOptions);
          ocrData = result.data;
          break;
        } catch (error) {
          lastError = error;
          logger.warn(`OCR attempt ${attempt} failed`, { error: error.message, attempt });
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
          }
        }
      }
      
      if (!ocrData) {
        throw new Error(`OCR failed after ${maxRetries} attempts: ${lastError?.message}`);
      }

      // Enhanced result processing with quality metrics
      const processedText = this.postProcessText(ocrData.text, options);
      const qualityMetrics = this.calculateQualityMetrics(ocrData);
      
      const ocrResult: OCRResult = {
        text: processedText,
        confidence: this.calculateOverallConfidence(ocrData, qualityMetrics),
        boxes: ocrData.words
          .filter((word: any) => word.confidence > (options.confidenceThreshold || 30))
          .map((word: any) => ({
            text: word.text,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1
            },
            confidence: word.confidence / 100 // Normalize to 0-1
          })),
        pageRef: casIntegration.enabled ? this.generateImageHash(processedImageBuffer) : undefined
      };
      
      logger.info('OCR processing completed', {
        textLength: processedText.length,
        wordCount: ocrData.words.length,
        filteredWords: ocrResult.boxes.length,
        confidence: ocrResult.confidence,
        qualityMetrics
      });

      // Enhanced CAS storage with compression and validation
      if (casIntegration.enabled) {
        const cacheKey = ocrResult.pageRef || imageUrl || 'buffer';
        await this.storeToCAS(cacheKey, ocrResult, casIntegration, {
          imageHash: this.generateImageHash(processedImageBuffer),
          processingOptions: options,
          qualityMetrics
        });
      }

      const processingTime = perfLogger.end(true);

      logger.info('OCR processing completed', {
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence,
        boxCount: ocrResult.boxes.length
      });

      return {
        success: true,
        data: ocrResult,
        metadata: {
          processingTime,
          costEstimate,
          confidence: ocrResult.confidence
        }
      };

    } catch (error) {
      const processingTime = perfLogger.end(false, { error: error.message });
      logger.error('OCR processing failed', error, { 
        imageSize: args && typeof args === 'object' && 'imageBuffer' in args ? (args as any).imageBuffer?.length : 0,
        options: args && typeof args === 'object' && 'options' in args ? (args as any).options : {}
      });

      // Enhanced error categorization
      const errorCategory = this.categorizeError(error);
      
      return {
        success: false,
        error: `OCR processing failed (${errorCategory}): ${error.message}`,
        metadata: {
          processingTime,
          costEstimate: CostEstimator.estimateOCR(0, {}),
          errorCategory,
          retryable: ['network', 'temporary'].includes(errorCategory)
        }
      };
    }
  }

  private static async getWorker(language: string = 'eng') {
    if (!this.worker || this.worker.currentLanguage !== language) {
      if (this.worker) {
        await this.worker.terminate();
      }
      
      logger.info('Initializing Tesseract worker', { language });
      this.worker = await createWorker(language, OEM.LSTM_ONLY);
      this.worker.currentLanguage = language;
    }
    return this.worker;
  }

  /**
   * Load image from URL with validation and error handling
   */
  private static async loadImageFromUrl(imageUrl: string): Promise<Buffer> {
    try {
      if (imageUrl.startsWith('data:')) {
        // Handle base64 data URLs
        const base64Data = imageUrl.split(',')[1];
        return Buffer.from(base64Data, 'base64');
      } else {
        // Handle HTTP/HTTPS URLs
        const response = await fetch(imageUrl, {
          timeout: 30000, // 30s timeout
          headers: {
            'User-Agent': 'OCRTool/1.1.0'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType?.startsWith('image/')) {
          throw new Error(`Invalid content type: ${contentType}. Expected image/*`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch (error) {
      logger.error('Failed to load image from URL', error, { imageUrl });
      throw new Error(`Image loading failed: ${error.message}`);
    }
  }

  private static async checkCASCache(
    cacheKey: string,
    casConfig: CASIntegration
  ): Promise<OCRResult | null> {
    try {
      // Always check local cache first
      const localCached = this.casCache.get(cacheKey);
      if (localCached) {
        logger.debug('OCR result found in local cache', { cacheKey });
        return localCached;
      }

      // Check external CAS system if configured
      if (casConfig.endpoint && casConfig.apiKey) {
        const response = await fetch(`${casConfig.endpoint}/cache/${encodeURIComponent(cacheKey)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${casConfig.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 5000 // 5s timeout for cache checks
        });

        if (response.ok) {
          const cached = await response.json();
          
          // Validate cache structure
          if (this.validateCacheStructure(cached)) {
            // Store in local cache for future use
            this.casCache.set(cacheKey, cached);
            logger.info('OCR result retrieved from external CAS cache', { cacheKey });
            return cached;
          } else {
            logger.warn('Invalid cache structure from CAS', { cacheKey });
          }
        } else if (response.status !== 404) {
          logger.warn('CAS cache check failed', { 
            status: response.status, 
            statusText: response.statusText,
            cacheKey 
          });
        }
      }

      return null;
    } catch (error) {
      logger.warn('CAS cache check failed', error, { cacheKey });
      return null;
    }
  }

  private static async storeToCAS(
    cacheKey: string,
    result: OCRResult,
    casConfig: CASIntegration,
    metadata?: any
  ): Promise<void> {
    try {
      // Store in local cache with TTL
      this.casCache.set(cacheKey, result);
      
      // Store in external CAS if configured
      if (casConfig.endpoint && casConfig.apiKey) {
        let payload = result;
        
        // Apply compression if enabled
        if (casConfig.compression) {
          payload = this.compressOCRResult(result);
        }
        
        const cachePayload = {
          key: cacheKey,
          value: payload,
          ttl: casConfig.ttl || 3600,
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.1.0',
            checksum: casConfig.checksumValidation ? this.generateResultChecksum(result) : undefined,
            ...metadata
          }
        };
        
        const response = await fetch(`${casConfig.endpoint}/cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${casConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cachePayload),
          timeout: 10000 // 10s timeout for storage
        });
        
        if (response.ok) {
          logger.info('OCR result stored to external CAS cache', { 
            cacheKey, 
            compressed: casConfig.compression,
            ttl: cachePayload.ttl 
          });
        } else {
          logger.warn('Failed to store to external CAS cache', {
            status: response.status,
            statusText: response.statusText,
            cacheKey
          });
        }
      }
    } catch (error) {
      logger.warn('CAS cache storage failed', error, { cacheKey });
    }
  }

  /**
   * Generate preprocessing cache key
   */
  private static generatePreprocessKey(imageBuffer: Buffer, options: OCRArgs['options']): string {
    const optionsHash = createHash('md5').update(JSON.stringify(options)).digest('hex').substring(0, 8);
    const imageHash = createHash('md5').update(imageBuffer).digest('hex').substring(0, 16);
    return `preprocess:${imageHash}:${optionsHash}`;
  }

  /**
   * Generate image hash for CAS integrity
   */
  private static generateImageHash(imageBuffer: Buffer): string {
    return createHash('sha256').update(imageBuffer).digest('hex');
  }

  /**
   * Preprocess image for better OCR results
   */
  private static async preprocessImage(imageBuffer: Buffer, options: OCRArgs['options']): Promise<Buffer> {
    try {
      let image = sharp(imageBuffer);
      
      // Get image metadata
      const metadata = await image.metadata();
      logger.debug('Image metadata', { width: metadata.width, height: metadata.height, format: metadata.format });
      
      // DPI optimization
      if (options.dpi && options.dpi !== 300) {
        image = image.resize({ 
          width: Math.round((metadata.width || 1000) * (options.dpi / 300)),
          height: Math.round((metadata.height || 1000) * (options.dpi / 300)),
          kernel: sharp.kernel.lanczos3
        });
      }
      
      // Quality vs Speed preprocessing
      switch (options.qualityVsSpeed) {
        case 'quality':
          image = image
            .sharpen({ sigma: 1, flat: 1, jagged: 2 })
            .modulate({ brightness: 1.05, saturation: 0.9 })
            .normalize();
          break;
          
        case 'speed':
          // Minimal preprocessing for speed
          image = image.greyscale();
          break;
          
        case 'balanced':
        default:
          image = image
            .greyscale()
            .sharpen({ sigma: 0.5 })
            .normalize();
          break;
      }
      
      // Convert to format optimized for OCR
      const processedBuffer = await image
        .png({ quality: 95, compressionLevel: 6 })
        .toBuffer();
        
      logger.debug('Image preprocessed', { 
        originalSize: imageBuffer.length,
        processedSize: processedBuffer.length,
        qualityMode: options.qualityVsSpeed
      });
        
      return processedBuffer;
    } catch (error) {
      logger.warn('Image preprocessing failed, using original', error);
      return imageBuffer;
    }
  }

  /**
   * Build Tesseract parameters based on options
   */
  private static buildTesseractParams(options: OCRArgs['options']): Record<string, any> {
    const params: Record<string, any> = {
      tessedit_pageseg_mode: options.psm || PSM.SINGLE_BLOCK,
      tessedit_ocr_engine_mode: options.oem || OEM.LSTM_ONLY,
    };

    // Character filtering
    if (options.whitelistChars) {
      params.tessedit_char_whitelist = options.whitelistChars;
    }
    if (options.blacklistChars) {
      params.tessedit_char_blacklist = options.blacklistChars;
    }

    // Quality vs Speed optimizations
    switch (options.qualityVsSpeed) {
      case 'quality':
        params.tessedit_create_hocr = 1;
        params.tessedit_create_tsv = 1;
        params.textord_min_linesize = 2.5;
        break;
        
      case 'speed':
        params.tessedit_enable_doc_dict = 0;
        params.tessedit_enable_bigram_correction = 0;
        params.textord_single_height_wds = 1;
        break;
        
      case 'balanced':
      default:
        params.tessedit_enable_doc_dict = 1;
        break;
    }

    return params;
  }

  /**
   * Post-process OCR text results
   */
  private static postProcessText(rawText: string, options: OCRArgs['options']): string {
    let text = rawText.trim();
    
    // Basic cleanup
    text = text
      .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
      .replace(/\s{2,}/g, ' ') // Remove excessive spaces
      .replace(/[^\S\n]{2,}/g, ' '); // Clean up whitespace but preserve single newlines
    
    // Quality mode gets additional processing
    if (options.qualityVsSpeed === 'quality') {
      // Fix common OCR errors
      text = text
        .replace(/\b(\w)'(\w)\b/g, '$1\'$2') // Fix apostrophes
        .replace(/(\w)\s+([,.!?;:])/g, '$1$2') // Fix punctuation spacing
        .replace(/([.!?])\s*([a-z])/g, '$1 $2'); // Ensure sentence spacing
    }
    
    return text;
  }

  /**
   * Calculate quality metrics for OCR results
   */
  private static calculateQualityMetrics(ocrData: any): Record<string, number> {
    const words = ocrData.words || [];
    const confidences = words.map((w: any) => w.confidence).filter((c: number) => c > 0);
    
    return {
      averageConfidence: confidences.length > 0 ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length : 0,
      lowConfidenceWords: confidences.filter((c: number) => c < 50).length,
      highConfidenceWords: confidences.filter((c: number) => c > 80).length,
      totalWords: words.length,
      emptyWords: words.filter((w: any) => !w.text || w.text.trim().length === 0).length
    };
  }

  /**
   * Calculate overall confidence score
   */
  private static calculateOverallConfidence(ocrData: any, qualityMetrics: Record<string, number>): number {
    const baseConfidence = ocrData.confidence || 0;
    const avgWordConfidence = qualityMetrics.averageConfidence || 0;
    
    // Weight overall confidence with word-level confidence
    const weightedConfidence = (baseConfidence * 0.3 + avgWordConfidence * 0.7) / 100;
    
    // Apply penalties for quality issues
    let penalty = 0;
    if (qualityMetrics.emptyWords > 0) penalty += 0.05;
    if (qualityMetrics.lowConfidenceWords / qualityMetrics.totalWords > 0.3) penalty += 0.1;
    
    return Math.max(0, Math.min(1, weightedConfidence - penalty));
  }

  /**
   * Validate cache integrity
   */
  private static validateCacheIntegrity(cachedResult: OCRResult, expectedHash: string): boolean {
    if (!cachedResult.pageRef) return false;
    return cachedResult.pageRef === expectedHash;
  }

  /**
   * Validate cache structure
   */
  private static validateCacheStructure(cached: any): cached is OCRResult {
    return cached &&
           typeof cached.text === 'string' &&
           typeof cached.confidence === 'number' &&
           Array.isArray(cached.boxes);
  }

  /**
   * Compress OCR result for storage
   */
  private static compressOCRResult(result: OCRResult): OCRResult {
    // Remove low-confidence boxes to reduce size
    const compressedBoxes = result.boxes.filter(box => box.confidence > 0.3);
    
    return {
      ...result,
      boxes: compressedBoxes,
      // Round confidence values to reduce precision
      confidence: Math.round(result.confidence * 1000) / 1000,
      text: result.text // Keep full text
    };
  }

  /**
   * Generate result checksum for validation
   */
  private static generateResultChecksum(result: OCRResult): string {
    const checksumData = {
      text: result.text,
      confidence: result.confidence,
      boxCount: result.boxes.length
    };
    return createHash('md5').update(JSON.stringify(checksumData)).digest('hex').substring(0, 16);
  }

  /**
   * Categorize errors for better error handling
   */
  private static categorizeError(error: any): string {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'network';
    }
    if (message.includes('worker') || message.includes('tesseract')) {
      return 'engine';
    }
    if (message.includes('image') || message.includes('format') || message.includes('corrupt')) {
      return 'image';
    }
    if (message.includes('memory') || message.includes('resource')) {
      return 'resource';
    }
    
    return 'unknown';
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { 
    cas: { size: number; maxSize: number }; 
    preprocessing: { size: number; maxSize: number };
  } {
    return {
      cas: {
        size: this.casCache.size,
        maxSize: this.casCache.max
      },
      preprocessing: {
        size: this.preprocessingCache.size,
        maxSize: this.preprocessingCache.max
      }
    };
  }

  /**
   * Clear all caches
   */
  static clearCaches(): void {
    this.casCache.clear();
    this.preprocessingCache.clear();
    logger.info('All OCR caches cleared');
  }

  /**
   * Cleanup resources
   */
  static async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.clearCaches();
    logger.info('OCR tool cleanup completed');
  }
}