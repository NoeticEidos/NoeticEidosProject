/**
 * JSON Schemas for OCR, NER, and Route validation
 * Loads actual schema definitions from filesystem for v1.1 gRPC protocol
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemasDir = join(__dirname, '../../../schemas');

// Load real JSON schemas from filesystem
let OCR_SCHEMA_JSON: any;
let NER_SCHEMA_JSON: any;
let ROUTE_SCHEMA_JSON: any;

try {
  OCR_SCHEMA_JSON = JSON.parse(readFileSync(join(schemasDir, 'ocr-v1.json'), 'utf-8'));
  NER_SCHEMA_JSON = JSON.parse(readFileSync(join(schemasDir, 'ner-v1.json'), 'utf-8'));
  ROUTE_SCHEMA_JSON = JSON.parse(readFileSync(join(schemasDir, 'route-v1.json'), 'utf-8'));
} catch (error) {
  console.error('Failed to load JSON schemas:', error);
  // Fallback to embedded schemas
  OCR_SCHEMA_JSON = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["page_ref", "lang_hint", "ocr_mode"],
    "properties": {
      "page_ref": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "lang_hint": {
        "type": "string",
        "enum": ["en", "es", "fr", "de", "auto"],
        "default": "auto"
      },
      "ocr_mode": {
        "type": "string",
        "enum": ["fast", "balanced", "accurate"],
        "default": "balanced"
      }
    },
    "additionalProperties": false
  };
  
  NER_SCHEMA_JSON = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["text", "entity_schema_version"],
    "properties": {
      "text": {
        "type": "string",
        "minLength": 1,
        "maxLength": 50000
      },
      "entity_schema_version": {
        "type": "string",
        "pattern": "^v[0-9]+\\.[0-9]+$"
      }
    },
    "additionalProperties": false
  };
  
  ROUTE_SCHEMA_JSON = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["entities", "ruleset_version"],
    "properties": {
      "entities": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "text", "confidence"],
          "properties": {
            "type": {
              "type": "string",
              "enum": ["PERSON", "ORG", "MONEY", "DATE", "LOCATION"]
            },
            "text": {"type": "string"},
            "confidence": {
              "type": "number",
              "minimum": 0.0,
              "maximum": 1.0
            }
          }
        }
      },
      "ruleset_version": {
        "type": "string",
        "pattern": "^v[0-9]+\\.[0-9]+$"
      }
    },
    "additionalProperties": false
  };
}

export interface OCRData {
  page_ref: string;
  lang_hint?: 'en' | 'es' | 'fr' | 'de' | 'auto';
  ocr_mode?: 'fast' | 'balanced' | 'accurate';
  resolution_dpi?: number;
  quality_speed_tradeoff?: number;
}

export interface NERData {
  text: string;
  domain_hint?: 'legal' | 'medical' | 'financial' | 'general';
  entity_schema_version: string;
  postproc_thresholds?: {
    min_confidence?: number;
    min_entity_length?: number;
  };
}

export interface RouteData {
  entities: Array<{
    type: 'PERSON' | 'ORG' | 'MONEY' | 'DATE' | 'LOCATION';
    text: string;
    span?: {
      start: number;
      end: number;
    };
    confidence: number;
  }>;
  ruleset_version: string;
  business_constraints?: {
    priority_entities?: string[];
    risk_tolerance?: 'low' | 'medium' | 'high';
  };
}

// Compiled schemas for runtime validation (loaded from filesystem)
export const OCR_SCHEMA = OCR_SCHEMA_JSON;

export const NER_SCHEMA = NER_SCHEMA_JSON;

export const ROUTE_SCHEMA = ROUTE_SCHEMA_JSON;

export const ALL_SCHEMAS = {
  ocr: OCR_SCHEMA,
  ner: NER_SCHEMA,
  route: ROUTE_SCHEMA
} as const;

export type SchemaType = keyof typeof ALL_SCHEMAS;

// Schema validation and error formatting utilities
export interface DetailedValidationError {
  path: string;
  message: string;
  value?: any;
  allowedValues?: any[];
  constraint?: string;
}

export interface ValidationContext {
  stepId: string;
  stepType: string;
  userId?: string;
  sessionId?: string;
  timestamp: number;
}

export function formatValidationErrors(errors: any[], context?: ValidationContext): DetailedValidationError[] {
  return errors.map(error => ({
    path: error.instancePath || error.dataPath || 'root',
    message: error.message || 'Validation failed',
    value: error.data,
    allowedValues: error.schema?.enum,
    constraint: error.keyword
  }));
}

export function createContextualErrorMessage(error: DetailedValidationError, context?: ValidationContext): string {
  const base = `Validation failed at ${error.path}: ${error.message}`;
  const contextInfo = context ? ` (Step: ${context.stepId}, Type: ${context.stepType})` : '';
  const suggestions = getSuggestions(error);
  return `${base}${contextInfo}${suggestions ? `. Suggestion: ${suggestions}` : ''}`;
}

function getSuggestions(error: DetailedValidationError): string | null {
  if (error.constraint === 'enum' && error.allowedValues) {
    return `Use one of: ${error.allowedValues.join(', ')}`;
  }
  if (error.constraint === 'pattern') {
    return 'Check the format requirements';
  }
  if (error.constraint === 'minimum' || error.constraint === 'maximum') {
    return 'Check the value range';
  }
  if (error.constraint === 'required') {
    return 'This field is mandatory';
  }
  return null;
}