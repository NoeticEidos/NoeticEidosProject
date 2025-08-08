// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Switch to the orchestrator database
db = db.getSiblingDB('orchestrator');

// Create collections with validation schemas
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'username', 'createdAt'],
      properties: {
        email: {
          bsonType: 'string',
          description: 'User email address'
        },
        username: {
          bsonType: 'string',
          description: 'Unique username'
        },
        password: {
          bsonType: 'string',
          description: 'Hashed password'
        },
        role: {
          bsonType: 'string',
          enum: ['admin', 'user', 'operator'],
          description: 'User role'
        },
        active: {
          bsonType: 'bool',
          description: 'User active status'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Last update timestamp'
        }
      }
    }
  }
});

db.createCollection('tasks', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'type', 'status', 'createdAt'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Task name'
        },
        type: {
          bsonType: 'string',
          enum: ['ocr', 'nlp', 'workflow', 'custom'],
          description: 'Task type'
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Task status'
        },
        priority: {
          bsonType: 'int',
          minimum: 1,
          maximum: 10,
          description: 'Task priority (1-10)'
        },
        payload: {
          bsonType: 'object',
          description: 'Task payload data'
        },
        result: {
          bsonType: 'object',
          description: 'Task result data'
        },
        error: {
          bsonType: 'string',
          description: 'Error message if task failed'
        },
        createdBy: {
          bsonType: 'objectId',
          description: 'User who created the task'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Last update timestamp'
        },
        completedAt: {
          bsonType: 'date',
          description: 'Completion timestamp'
        }
      }
    }
  }
});

db.createCollection('workflows', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'steps', 'createdAt'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Workflow name'
        },
        description: {
          bsonType: 'string',
          description: 'Workflow description'
        },
        steps: {
          bsonType: 'array',
          description: 'Workflow steps',
          items: {
            bsonType: 'object',
            required: ['type', 'config'],
            properties: {
              type: {
                bsonType: 'string',
                description: 'Step type'
              },
              config: {
                bsonType: 'object',
                description: 'Step configuration'
              }
            }
          }
        },
        active: {
          bsonType: 'bool',
          description: 'Workflow active status'
        },
        createdBy: {
          bsonType: 'objectId',
          description: 'User who created the workflow'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Last update timestamp'
        }
      }
    }
  }
});

db.createCollection('files', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['filename', 'originalName', 'mimeType', 'size', 'createdAt'],
      properties: {
        filename: {
          bsonType: 'string',
          description: 'Stored filename'
        },
        originalName: {
          bsonType: 'string',
          description: 'Original filename'
        },
        mimeType: {
          bsonType: 'string',
          description: 'File MIME type'
        },
        size: {
          bsonType: 'long',
          description: 'File size in bytes'
        },
        path: {
          bsonType: 'string',
          description: 'File storage path'
        },
        metadata: {
          bsonType: 'object',
          description: 'File metadata'
        },
        processed: {
          bsonType: 'bool',
          description: 'Processing status'
        },
        uploadedBy: {
          bsonType: 'objectId',
          description: 'User who uploaded the file'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Upload timestamp'
        }
      }
    }
  }
});

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ active: 1 });
db.users.createIndex({ createdAt: -1 });

db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ type: 1 });
db.tasks.createIndex({ priority: -1 });
db.tasks.createIndex({ createdBy: 1 });
db.tasks.createIndex({ createdAt: -1 });
db.tasks.createIndex({ updatedAt: -1 });
db.tasks.createIndex({ completedAt: -1 });

db.workflows.createIndex({ name: 1 });
db.workflows.createIndex({ active: 1 });
db.workflows.createIndex({ createdBy: 1 });
db.workflows.createIndex({ createdAt: -1 });

db.files.createIndex({ filename: 1 }, { unique: true });
db.files.createIndex({ mimeType: 1 });
db.files.createIndex({ processed: 1 });
db.files.createIndex({ uploadedBy: 1 });
db.files.createIndex({ createdAt: -1 });

// Create compound indexes
db.tasks.createIndex({ status: 1, priority: -1 });
db.tasks.createIndex({ type: 1, status: 1 });
db.tasks.createIndex({ createdBy: 1, status: 1 });

// Create admin user (for development only)
if (db.getName() === 'orchestrator') {
  db.users.insertOne({
    email: 'admin@orchestrator.local',
    username: 'admin',
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2DjJu0O4fy', // password: admin123
    role: 'admin',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  print('Admin user created: admin@orchestrator.local (password: admin123)');
}

// Create sample workflow
db.workflows.insertOne({
  name: 'OCR Processing Pipeline',
  description: 'Extract text from uploaded images using OCR',
  steps: [
    {
      type: 'file-validation',
      config: {
        allowedTypes: ['image/jpeg', 'image/png', 'application/pdf']
      }
    },
    {
      type: 'ocr-processing',
      config: {
        language: 'eng',
        outputFormat: 'text'
      }
    },
    {
      type: 'nlp-analysis',
      config: {
        tasks: ['entity-extraction', 'sentiment-analysis']
      }
    }
  ],
  active: true,
  createdBy: db.users.findOne({ username: 'admin' })._id,
  createdAt: new Date(),
  updatedAt: new Date()
});

print('Database initialization completed successfully!');
print('Collections created: users, tasks, workflows, files');
print('Indexes created for optimal performance');
print('Sample data inserted');