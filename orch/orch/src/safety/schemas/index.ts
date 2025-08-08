/**
 * JSON Schemas for OCR, NER, and Route validation
 * Provides exact schema definitions for safety validation
 */

export interface OCRSchema {
  type: 'object';
  properties: {
    text: { type: 'string' };
    confidence: { type: 'number'; minimum: 0; maximum: 1 };
    boundingBoxes?: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          x: { type: 'number'; minimum: 0 };
          y: { type: 'number'; minimum: 0 };
          width: { type: 'number'; minimum: 0 };
          height: { type: 'number'; minimum: 0 };
          text: { type: 'string' };
          confidence: { type: 'number'; minimum: 0; maximum: 1 };
        };
        required: ['x', 'y', 'width', 'height', 'text', 'confidence'];
        additionalProperties: false;
      };
    };
    metadata?: {
      type: 'object';
      properties: {
        pageNumber?: { type: 'number'; minimum: 1 };
        processingTime?: { type: 'number'; minimum: 0 };
        imageSize?: {
          type: 'object';
          properties: {
            width: { type: 'number'; minimum: 1 };
            height: { type: 'number'; minimum: 1 };
          };
          required: ['width', 'height'];
          additionalProperties: false;
        };
      };
      additionalProperties: false;
    };
  };
  required: ['text', 'confidence'];
  additionalProperties: false;
}

export interface NERSchema {
  type: 'object';
  properties: {
    entities: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          text: { type: 'string' };
          label: { 
            type: 'string';
            enum: ['PERSON', 'ORG', 'GPE', 'MONEY', 'DATE', 'TIME', 'PERCENT', 'CARDINAL', 'ORDINAL'];
          };
          start: { type: 'number'; minimum: 0 };
          end: { type: 'number'; minimum: 0 };
          confidence: { type: 'number'; minimum: 0; maximum: 1 };
          metadata?: {
            type: 'object';
            properties: {
              normalized?: { type: 'string' };
              linkedEntity?: { type: 'string'; format: 'uri' };
              alternativeLabels?: {
                type: 'array';
                items: { type: 'string' };
              };
            };
            additionalProperties: false;
          };
        };
        required: ['text', 'label', 'start', 'end', 'confidence'];
        additionalProperties: false;
      };
    };
    originalText: { type: 'string' };
    processingMetadata?: {
      type: 'object';
      properties: {
        model: { type: 'string' };
        version: { type: 'string' };
        processingTime: { type: 'number'; minimum: 0 };
        language?: { type: 'string'; pattern: '^[a-z]{2}(-[A-Z]{2})?$' };
      };
      additionalProperties: false;
    };
  };
  required: ['entities', 'originalText'];
  additionalProperties: false;
}

export interface RouteSchema {
  type: 'object';
  properties: {
    path: { 
      type: 'string'; 
      pattern: '^/[a-zA-Z0-9/_-]*$';
    };
    method: { 
      type: 'string';
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    };
    parameters?: {
      type: 'object';
      properties: {
        query?: {
          type: 'object';
          patternProperties: {
            '^[a-zA-Z_][a-zA-Z0-9_]*$': {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { 
                  type: 'array';
                  items: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'boolean' }
                    ];
                  };
                }
              ];
            };
          };
          additionalProperties: false;
        };
        path?: {
          type: 'object';
          patternProperties: {
            '^[a-zA-Z_][a-zA-Z0-9_]*$': {
              oneOf: [
                { type: 'string' },
                { type: 'number' }
              ];
            };
          };
          additionalProperties: false;
        };
        headers?: {
          type: 'object';
          patternProperties: {
            '^[a-zA-Z-]+$': { type: 'string' };
          };
          additionalProperties: false;
        };
      };
      additionalProperties: false;
    };
    body?: {
      type: 'object';
      properties: {
        contentType: { 
          type: 'string';
          enum: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
        };
        data: {
          oneOf: [
            { type: 'object' },
            { type: 'string' },
            { type: 'array' }
          ];
        };
        size?: { type: 'number'; minimum: 0; maximum: 10485760 }; // 10MB limit
      };
      required: ['contentType', 'data'];
      additionalProperties: false;
    };
    timeout?: { type: 'number'; minimum: 100; maximum: 300000 }; // 100ms to 5min
    retries?: { type: 'number'; minimum: 0; maximum: 5 };
    authentication?: {
      type: 'object';
      properties: {
        type: { 
          type: 'string';
          enum: ['bearer', 'basic', 'apikey', 'oauth2'];
        };
        credentials: { type: 'string' };
        scope?: { type: 'string' };
      };
      required: ['type', 'credentials'];
      additionalProperties: false;
    };
    validation?: {
      type: 'object';
      properties: {
        expectedStatus?: {
          type: 'array';
          items: { type: 'number'; minimum: 100; maximum: 599 };
        };
        responseSchema?: { type: 'object' };
        maxResponseSize?: { type: 'number'; minimum: 1; maximum: 104857600 }; // 100MB limit
      };
      additionalProperties: false;
    };
  };
  required: ['path', 'method'];
  additionalProperties: false;
}

// Compiled schemas for runtime validation
export const OCR_SCHEMA: OCRSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    boundingBoxes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number', minimum: 0 },
          y: { type: 'number', minimum: 0 },
          width: { type: 'number', minimum: 0 },
          height: { type: 'number', minimum: 0 },
          text: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        },
        required: ['x', 'y', 'width', 'height', 'text', 'confidence'],
        additionalProperties: false
      }
    },
    metadata: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', minimum: 1 },
        processingTime: { type: 'number', minimum: 0 },
        imageSize: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 }
          },
          required: ['width', 'height'],
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  required: ['text', 'confidence'],
  additionalProperties: false
};

export const NER_SCHEMA: NERSchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          label: { 
            type: 'string',
            enum: ['PERSON', 'ORG', 'GPE', 'MONEY', 'DATE', 'TIME', 'PERCENT', 'CARDINAL', 'ORDINAL']
          },
          start: { type: 'number', minimum: 0 },
          end: { type: 'number', minimum: 0 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          metadata: {
            type: 'object',
            properties: {
              normalized: { type: 'string' },
              linkedEntity: { type: 'string', format: 'uri' },
              alternativeLabels: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            additionalProperties: false
          }
        },
        required: ['text', 'label', 'start', 'end', 'confidence'],
        additionalProperties: false
      }
    },
    originalText: { type: 'string' },
    processingMetadata: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        version: { type: 'string' },
        processingTime: { type: 'number', minimum: 0 },
        language: { type: 'string', pattern: '^[a-z]{2}(-[A-Z]{2})?$' }
      },
      additionalProperties: false
    }
  },
  required: ['entities', 'originalText'],
  additionalProperties: false
};

export const ROUTE_SCHEMA: RouteSchema = {
  type: 'object',
  properties: {
    path: { 
      type: 'string', 
      pattern: '^/[a-zA-Z0-9/_-]*$'
    },
    method: { 
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
    },
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z_][a-zA-Z0-9_]*$': {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { 
                  type: 'array',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'boolean' }
                    ]
                  }
                }
              ]
            }
          },
          additionalProperties: false
        },
        path: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z_][a-zA-Z0-9_]*$': {
              oneOf: [
                { type: 'string' },
                { type: 'number' }
              ]
            }
          },
          additionalProperties: false
        },
        headers: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z-]+$': { type: 'string' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    body: {
      type: 'object',
      properties: {
        contentType: { 
          type: 'string',
          enum: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']
        },
        data: {
          oneOf: [
            { type: 'object' },
            { type: 'string' },
            { type: 'array' }
          ]
        },
        size: { type: 'number', minimum: 0, maximum: 10485760 }
      },
      required: ['contentType', 'data'],
      additionalProperties: false
    },
    timeout: { type: 'number', minimum: 100, maximum: 300000 },
    retries: { type: 'number', minimum: 0, maximum: 5 },
    authentication: {
      type: 'object',
      properties: {
        type: { 
          type: 'string',
          enum: ['bearer', 'basic', 'apikey', 'oauth2']
        },
        credentials: { type: 'string' },
        scope: { type: 'string' }
      },
      required: ['type', 'credentials'],
      additionalProperties: false
    },
    validation: {
      type: 'object',
      properties: {
        expectedStatus: {
          type: 'array',
          items: { type: 'number', minimum: 100, maximum: 599 }
        },
        responseSchema: { type: 'object' },
        maxResponseSize: { type: 'number', minimum: 1, maximum: 104857600 }
      },
      additionalProperties: false
    }
  },
  required: ['path', 'method'],
  additionalProperties: false
};

export const ALL_SCHEMAS = {
  ocr: OCR_SCHEMA,
  ner: NER_SCHEMA,
  route: ROUTE_SCHEMA
} as const;

export type SchemaType = keyof typeof ALL_SCHEMAS;
export type OCRData = {
  text: string;
  confidence: number;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    confidence: number;
  }>;
  metadata?: {
    pageNumber?: number;
    processingTime?: number;
    imageSize?: {
      width: number;
      height: number;
    };
  };
};

export type NERData = {
  entities: Array<{
    text: string;
    label: 'PERSON' | 'ORG' | 'GPE' | 'MONEY' | 'DATE' | 'TIME' | 'PERCENT' | 'CARDINAL' | 'ORDINAL';
    start: number;
    end: number;
    confidence: number;
    metadata?: {
      normalized?: string;
      linkedEntity?: string;
      alternativeLabels?: string[];
    };
  }>;
  originalText: string;
  processingMetadata?: {
    model?: string;
    version?: string;
    processingTime?: number;
    language?: string;
  };
};

export type RouteData = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  parameters?: {
    query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
    path?: Record<string, string | number>;
    headers?: Record<string, string>;
  };
  body?: {
    contentType: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain';
    data: object | string | Array<any>;
    size?: number;
  };
  timeout?: number;
  retries?: number;
  authentication?: {
    type: 'bearer' | 'basic' | 'apikey' | 'oauth2';
    credentials: string;
    scope?: string;
  };
  validation?: {
    expectedStatus?: number[];
    responseSchema?: object;
    maxResponseSize?: number;
  };
};