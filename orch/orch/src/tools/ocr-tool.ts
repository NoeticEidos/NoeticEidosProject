import { createWorker, PSM, OEM } from 'tesseract.js';
import { ToolResult, OCRResult, CASIntegration } from '../types/index.js';
import { SchemaValidator, ocrArgsSchema, OCRArgs } from '../utils/validation.js';
import { CostEstimator } from '../utils/cost-estimator.js';
import { logger, PerformanceLogger } from '../utils/logger.js';

export class OCRTool {
  private static worker: any = null;
  private static casCache = new Map<string, OCRResult>();

  /**
   * Performs OCR on an image with optional CAS integration
   */
  static async execute(args: unknown): Promise<ToolResult<OCRResult>> {
    const perfLogger = new PerformanceLogger('OCR');
    
    try {
      // Validate arguments
      const validation = SchemaValidator.validate(ocrArgsSchema, args);
      if (!validation.valid) {
        return SchemaValidator.createErrorResponse(validation.errors);
      }

      const { imageUrl, imageBuffer, options, casIntegration } = validation.data!;
      
      // Estimate costs
      const imageSize = imageBuffer?.length || this.estimateImageSize(imageUrl);
      const costEstimate = CostEstimator.estimateOCR(imageSize, options);

      logger.info('Starting OCR processing', { 
        imageSize, 
        options,
        costEstimate 
      });

      // Check CAS cache first
      if (casIntegration.enabled) {
        const cachedResult = await this.checkCASCache(imageUrl, casIntegration);
        if (cachedResult) {
          const processingTime = perfLogger.end(true, { cached: true });
          return {
            success: true,
            data: cachedResult,
            metadata: {
              processingTime,
              costEstimate: { ...costEstimate, tokens: 0, computeUnits: 0 },
              confidence: cachedResult.confidence
            }
          };
        }
      }

      // Initialize Tesseract worker
      const worker = await this.getWorker();
      
      // Configure options
      await worker.setParameters({
        tessedit_pageseg_mode: options.psm,
        tessedit_ocr_engine_mode: options.oem,
        ...(options.whitelistChars && { tessedit_char_whitelist: options.whitelistChars }),
        ...(options.blacklistChars && { tessedit_char_blacklist: options.blacklistChars })
      });

      // Perform OCR
      const imageInput = imageBuffer || imageUrl;
      const { data } = await worker.recognize(imageInput, {
        lang: options.language
      });

      // Process results
      const ocrResult: OCRResult = {
        text: data.text.trim(),
        confidence: data.confidence,
        boxes: data.words.map((word: any) => ({
          text: word.text,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1
          },
          confidence: word.confidence
        }))
      };

      // Store in CAS if enabled
      if (casIntegration.enabled) {
        await this.storeToCAS(imageUrl, ocrResult, casIntegration);
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
      logger.error('OCR processing failed', { error });

      return {
        success: false,
        error: `OCR processing failed: ${error.message}`,
        metadata: {
          processingTime,
          costEstimate: CostEstimator.estimateOCR(0, {})
        }
      };
    }
  }

  private static async getWorker() {
    if (!this.worker) {
      this.worker = await createWorker('eng');
    }
    return this.worker;
  }

  private static estimateImageSize(imageUrl: string): number {
    // Rough estimation based on URL or default
    if (imageUrl.includes('base64')) {
      const base64Data = imageUrl.split(',')[1] || imageUrl;
      return Math.ceil((base64Data.length * 3) / 4);
    }
    // Default estimate for remote images
    return 1024 * 1024; // 1MB default
  }

  private static async checkCASCache(
    imageUrl: string, 
    casConfig: CASIntegration
  ): Promise<OCRResult | null> {
    try {
      if (!casConfig.endpoint || !casConfig.apiKey) {
        // Use local cache if no CAS endpoint
        return this.casCache.get(imageUrl) || null;
      }

      // Check external CAS system
      const response = await fetch(`${casConfig.endpoint}/cache/${encodeURIComponent(imageUrl)}`, {
        headers: {
          'Authorization': `Bearer ${casConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const cached = await response.json();
        logger.info('OCR result retrieved from CAS cache');
        return cached;
      }

      return null;
    } catch (error) {
      logger.warn('CAS cache check failed', { error: error.message });
      return null;
    }
  }

  private static async storeToCAS(
    imageUrl: string,
    result: OCRResult,
    casConfig: CASIntegration
  ): Promise<void> {
    try {
      // Store in local cache
      this.casCache.set(imageUrl, result);

      // Store in external CAS if configured
      if (casConfig.endpoint && casConfig.apiKey) {
        await fetch(`${casConfig.endpoint}/cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${casConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            key: imageUrl,
            value: result,
            ttl: 3600 // 1 hour default
          })
        });
        logger.info('OCR result stored to CAS cache');
      }
    } catch (error) {
      logger.warn('CAS cache storage failed', { error: error.message });
    }
  }

  /**
   * Cleanup resources
   */
  static async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.casCache.clear();
  }
}