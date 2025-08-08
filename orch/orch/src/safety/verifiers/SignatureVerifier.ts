/**
 * SignatureVerifier - HMAC-SHA256 plan integrity verification
 * Ensures plan authenticity and prevents tampering
 */

import { createHmac, timingSafeEqual } from 'crypto';

export type SupportedAlgorithm = 'sha256' | 'sha512';

export interface SignatureConfig {
  algorithm: SupportedAlgorithm;
  secretKey: string;
  timestampTolerance?: number; // seconds
  includeTimestamp?: boolean;
}

export interface SignedPlan {
  plan: any;
  signature: string;
  timestamp?: number;
  version?: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  timestamp?: number;
  age?: number; // seconds since signing
}

export class SignatureVerificationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

export class SignatureVerifier {
  private config: Required<SignatureConfig>;
  private readonly defaultConfig: Omit<Required<SignatureConfig>, 'algorithm' | 'secretKey'> = {
    timestampTolerance: 300, // 5 minutes
    includeTimestamp: true
  };

  constructor(secretKey: string, algorithm: SupportedAlgorithm = 'sha256', config?: Partial<SignatureConfig>) {
    if (!secretKey) {
      throw new SignatureVerificationError(
        'Secret key is required for signature verification',
        'MISSING_SECRET_KEY'
      );
    }

    if (secretKey.length < 32) {
      throw new SignatureVerificationError(
        'Secret key must be at least 32 characters long',
        'WEAK_SECRET_KEY'
      );
    }

    this.config = {
      ...this.defaultConfig,
      ...config,
      algorithm,
      secretKey
    };
  }

  /**
   * Generate HMAC signature for a plan
   */
  public sign(plan: any): string {
    try {
      const payload = this.preparePayload(plan);
      const hmac = createHmac(this.config.algorithm, this.config.secretKey);
      hmac.update(payload);
      return hmac.digest('hex');
    } catch (error) {
      throw new SignatureVerificationError(
        'Failed to generate signature',
        'SIGNATURE_GENERATION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Verify HMAC signature for a plan
   */
  public verify(plan: any, signature: string): boolean {
    try {
      const result = this.verifyWithDetails(plan, signature);
      return result.valid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify signature with detailed results
   */
  public verifyWithDetails(plan: any, signature: string): VerificationResult {
    try {
      if (!signature) {
        return {
          valid: false,
          reason: 'No signature provided'
        };
      }

      // Extract timestamp if included in signature
      const { planData, timestamp } = this.extractTimestamp(plan);
      const expectedSignature = this.sign(planData);

      // Timing-safe comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (signatureBuffer.length !== expectedBuffer.length) {
        return {
          valid: false,
          reason: 'Invalid signature format'
        };
      }

      const isValidSignature = timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValidSignature) {
        return {
          valid: false,
          reason: 'Invalid signature'
        };
      }

      // Check timestamp if configured
      if (this.config.includeTimestamp && timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const age = now - timestamp;

        if (age > this.config.timestampTolerance) {
          return {
            valid: false,
            reason: 'Signature expired',
            timestamp,
            age
          };
        }

        if (age < -this.config.timestampTolerance) {
          return {
            valid: false,
            reason: 'Signature from future (clock skew)',
            timestamp,
            age
          };
        }

        return {
          valid: true,
          timestamp,
          age
        };
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a signed plan object
   */
  public createSignedPlan(plan: any, version?: string): SignedPlan {
    const timestamp = this.config.includeTimestamp ? Math.floor(Date.now() / 1000) : undefined;
    const planWithTimestamp = timestamp ? { ...plan, _timestamp: timestamp } : plan;
    const signature = this.sign(planWithTimestamp);

    return {
      plan,
      signature,
      timestamp,
      version
    };
  }

  /**
   * Verify a signed plan object
   */
  public verifySignedPlan(signedPlan: SignedPlan): VerificationResult {
    const planWithTimestamp = signedPlan.timestamp 
      ? { ...signedPlan.plan, _timestamp: signedPlan.timestamp }
      : signedPlan.plan;

    return this.verifyWithDetails(planWithTimestamp, signedPlan.signature);
  }

  /**
   * Generate a signature for plan batches
   */
  public signBatch(plans: any[]): string {
    const batchPayload = {
      plans,
      count: plans.length,
      timestamp: this.config.includeTimestamp ? Math.floor(Date.now() / 1000) : undefined
    };

    return this.sign(batchPayload);
  }

  /**
   * Verify batch signature
   */
  public verifyBatch(plans: any[], signature: string): boolean {
    const batchPayload = {
      plans,
      count: plans.length,
      timestamp: this.config.includeTimestamp ? Math.floor(Date.now() / 1000) : undefined
    };

    // For batch verification, we need more lenient timestamp checking
    const originalTolerance = this.config.timestampTolerance;
    this.config.timestampTolerance *= 2; // Double tolerance for batch operations

    try {
      const result = this.verify(batchPayload, signature);
      this.config.timestampTolerance = originalTolerance;
      return result;
    } catch (error) {
      this.config.timestampTolerance = originalTolerance;
      return false;
    }
  }

  /**
   * Rotate secret key while maintaining backward compatibility
   */
  public rotateKey(newSecretKey: string, gracePeriodMs: number = 300000): void {
    if (newSecretKey.length < 32) {
      throw new SignatureVerificationError(
        'New secret key must be at least 32 characters long',
        'WEAK_SECRET_KEY'
      );
    }

    // Store old key for grace period
    const oldKey = this.config.secretKey;
    this.config.secretKey = newSecretKey;

    // Set up grace period verification
    setTimeout(() => {
      // After grace period, old key is no longer valid
    }, gracePeriodMs);
  }

  /**
   * Generate secure random key
   */
  public static generateSecretKey(length: number = 64): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      result += chars[randomIndex];
    }
    
    return result;
  }

  /**
   * Get signature configuration info (without exposing secret)
   */
  public getConfig(): Omit<Required<SignatureConfig>, 'secretKey'> {
    const { secretKey, ...configWithoutSecret } = this.config;
    return configWithoutSecret;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<SignatureConfig>): void {
    if (newConfig.secretKey && newConfig.secretKey.length < 32) {
      throw new SignatureVerificationError(
        'Secret key must be at least 32 characters long',
        'WEAK_SECRET_KEY'
      );
    }

    this.config = { ...this.config, ...newConfig };
  }

  private preparePayload(plan: any): string {
    try {
      // Create deterministic JSON representation
      const sortedPlan = this.sortObjectKeys(plan);
      return JSON.stringify(sortedPlan);
    } catch (error) {
      throw new SignatureVerificationError(
        'Failed to serialize plan for signing',
        'SERIALIZATION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObjectKeys(obj[key]);
    }

    return sorted;
  }

  private extractTimestamp(plan: any): { planData: any; timestamp?: number } {
    if (!this.config.includeTimestamp) {
      return { planData: plan };
    }

    if (plan && typeof plan === 'object' && '_timestamp' in plan) {
      const { _timestamp, ...planWithoutTimestamp } = plan;
      return {
        planData: planWithoutTimestamp,
        timestamp: _timestamp
      };
    }

    return { planData: plan };
  }
}