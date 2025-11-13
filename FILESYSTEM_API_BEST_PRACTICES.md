# REST API Design Best Practices for Filesystem Operations
## Dataroom Filesystem Implementation Guide

---

## 1. CRUD Endpoints for Files and Folders

### Recommended REST Endpoints

```
FOLDERS:
├── POST   /api/v1/folders                    # Create folder
├── GET    /api/v1/folders                    # List folders (root level)
├── GET    /api/v1/folders/{folderId}         # Get folder details
├── GET    /api/v1/folders/{folderId}/items   # List contents of folder
├── PATCH  /api/v1/folders/{folderId}         # Update folder (rename, metadata)
├── DELETE /api/v1/folders/{folderId}         # Delete folder

FILES:
├── POST   /api/v1/files/upload               # Upload file
├── GET    /api/v1/files/{fileId}             # Get file metadata
├── GET    /api/v1/files/{fileId}/download    # Download file
├── PATCH  /api/v1/files/{fileId}             # Update file metadata
├── DELETE /api/v1/files/{fileId}             # Delete file
└── POST   /api/v1/files/{fileId}/copy        # Copy file

BULK OPERATIONS:
├── POST   /api/v1/batch/move                 # Move multiple items
├── POST   /api/v1/batch/delete               # Delete multiple items
└── POST   /api/v1/batch/copy                 # Copy multiple items
```

### 1.1 Create Folder

**Request:**
```http
POST /api/v1/folders HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "2024 Financial Reports",
  "parentFolderId": "folder_123",
  "description": "Annual financial statements",
  "metadata": {
    "department": "Finance",
    "classification": "confidential"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "folder_456",
  "name": "2024 Financial Reports",
  "parentFolderId": "folder_123",
  "description": "Annual financial statements",
  "path": "/documents/2024 Financial Reports",
  "createdAt": "2025-11-13T10:30:00Z",
  "updatedAt": "2025-11-13T10:30:00Z",
  "createdBy": "user@example.com",
  "itemCount": 0,
  "size": 0,
  "metadata": {
    "department": "Finance",
    "classification": "confidential"
  }
}
```

### 1.2 List Folder Contents

**Request:**
```http
GET /api/v1/folders/folder_123/items?sort=name&order=asc&limit=20&offset=0 HTTP/1.1
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "item_1",
      "type": "folder",
      "name": "Q1 Reports",
      "parentFolderId": "folder_123",
      "path": "/documents/Q1 Reports",
      "createdAt": "2025-11-13T09:00:00Z",
      "updatedAt": "2025-11-13T09:00:00Z",
      "createdBy": "user@example.com",
      "itemCount": 5,
      "size": 150000000
    },
    {
      "id": "file_1",
      "type": "file",
      "name": "10-K Filing.pdf",
      "parentFolderId": "folder_123",
      "path": "/documents/10-K Filing.pdf",
      "mimeType": "application/pdf",
      "size": 2500000,
      "createdAt": "2025-11-12T14:30:00Z",
      "updatedAt": "2025-11-12T14:30:00Z",
      "createdBy": "user@example.com",
      "metadata": {
        "fileType": "document",
        "classification": "confidential"
      }
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### 1.3 Update Folder/File Metadata

**Request:**
```http
PATCH /api/v1/folders/folder_456 HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "2024 Financial Reports - Updated",
  "description": "Complete annual financial statements and audits",
  "metadata": {
    "department": "Finance",
    "classification": "confidential",
    "retentionDays": 2555
  }
}
```

**Response (200 OK):**
```json
{
  "id": "folder_456",
  "name": "2024 Financial Reports - Updated",
  "description": "Complete annual financial statements and audits",
  "path": "/documents/2024 Financial Reports - Updated",
  "updatedAt": "2025-11-13T11:45:00Z",
  "metadata": {
    "department": "Finance",
    "classification": "confidential",
    "retentionDays": 2555
  }
}
```

### 1.4 Delete Folder/File

**Request:**
```http
DELETE /api/v1/folders/folder_456 HTTP/1.1
Authorization: Bearer <token>
```

**Response Options:**

Hard Delete (204 No Content):
```http
204 No Content
```

Soft Delete with Recovery (200 OK):
```json
{
  "id": "folder_456",
  "name": "2024 Financial Reports - Updated",
  "status": "deleted",
  "deletedAt": "2025-11-13T11:50:00Z",
  "deletedBy": "user@example.com",
  "recoveryAvailableUntil": "2025-11-20T11:50:00Z",
  "canRecover": true
}
```

---

## 2. File Upload Handling

### 2.1 Simple Upload

**Request:**
```http
POST /api/v1/files/upload HTTP/1.1
Content-Type: multipart/form-data
Authorization: Bearer <token>

--boundary123
Content-Disposition: form-data; name="file"; filename="financial_report.pdf"
Content-Type: application/pdf

[Binary PDF data]
--boundary123
Content-Disposition: form-data; name="parentFolderId"

folder_123
--boundary123
Content-Disposition: form-data; name="metadata"
Content-Type: application/json

{"classification":"confidential","department":"Finance"}
--boundary123--
```

**Response (201 Created):**
```json
{
  "id": "file_789",
  "name": "financial_report.pdf",
  "parentFolderId": "folder_123",
  "size": 2500000,
  "mimeType": "application/pdf",
  "uploadedAt": "2025-11-13T12:00:00Z",
  "uploadedBy": "user@example.com",
  "checksum": {
    "algorithm": "SHA256",
    "value": "abc123def456..."
  },
  "status": "completed",
  "metadata": {
    "classification": "confidential",
    "department": "Finance"
  }
}
```

### 2.2 Chunked Upload (for Large Files)

**Step 1: Initiate Upload**
```http
POST /api/v1/files/upload/initiate HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "large_dataset.xlsx",
  "parentFolderId": "folder_123",
  "totalSize": 1073741824,
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "chunkSize": 5242880
}
```

**Response:**
```json
{
  "uploadId": "upload_xyz789",
  "filename": "large_dataset.xlsx",
  "totalSize": 1073741824,
  "chunkSize": 5242880,
  "totalChunks": 205,
  "expiresAt": "2025-11-14T12:00:00Z"
}
```

**Step 2: Upload Chunk**
```http
POST /api/v1/files/upload/xyz789/chunk HTTP/1.1
Content-Type: application/octet-stream
Authorization: Bearer <token>
X-Chunk-Number: 1
X-Chunk-Size: 5242880
X-Content-SHA256: abc123def456...

[Binary chunk data]
```

**Response:**
```json
{
  "uploadId": "upload_xyz789",
  "chunkNumber": 1,
  "status": "received",
  "receivedBytes": 5242880,
  "totalReceivedBytes": 5242880,
  "nextChunk": 2
}
```

**Step 3: Complete Upload**
```http
POST /api/v1/files/upload/xyz789/complete HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "uploadId": "upload_xyz789",
  "filename": "large_dataset.xlsx",
  "parentFolderId": "folder_123",
  "checksums": {
    "algorithm": "SHA256",
    "value": "complete_file_hash_xyz..."
  },
  "metadata": {
    "classification": "confidential"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "file_big_001",
  "name": "large_dataset.xlsx",
  "size": 1073741824,
  "uploadId": "upload_xyz789",
  "status": "completed",
  "uploadedAt": "2025-11-13T14:30:00Z",
  "checksum": {
    "algorithm": "SHA256",
    "value": "complete_file_hash_xyz..."
  }
}
```

### 2.3 Resumable Upload with Progress Tracking

**Get Upload Status:**
```http
GET /api/v1/files/upload/xyz789/status HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "uploadId": "upload_xyz789",
  "filename": "large_dataset.xlsx",
  "status": "in_progress",
  "totalSize": 1073741824,
  "uploadedBytes": 52428800,
  "chunkSize": 5242880,
  "receivedChunks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  "missingChunks": [11, 12, 13, ..., 205],
  "progress": 4.88,
  "estimatedTimeRemaining": "2h 30m",
  "expiresAt": "2025-11-14T12:00:00Z",
  "canResume": true
}
```

---

## 3. Hierarchical Folder Navigation

### 3.1 Breadcrumb Navigation

**Request:**
```http
GET /api/v1/folders/file_789/breadcrumbs HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "breadcrumbs": [
    {
      "id": "root",
      "name": "Root",
      "path": "/",
      "type": "folder"
    },
    {
      "id": "folder_100",
      "name": "Documents",
      "path": "/documents",
      "type": "folder"
    },
    {
      "id": "folder_123",
      "name": "2024",
      "path": "/documents/2024",
      "type": "folder"
    },
    {
      "id": "folder_456",
      "name": "Financial Reports",
      "path": "/documents/2024/Financial Reports",
      "type": "folder"
    }
  ]
}
```

### 3.2 Full Path Navigation

**Request:**
```http
GET /api/v1/navigation/path?path=/documents/2024/Financial%20Reports HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "path": "/documents/2024/Financial Reports",
  "id": "folder_456",
  "type": "folder",
  "fullPath": "/documents/2024/Financial Reports",
  "items": [
    {
      "id": "file_001",
      "type": "file",
      "name": "10-K.pdf",
      "size": 2500000,
      "createdAt": "2025-11-13T10:00:00Z"
    },
    {
      "id": "folder_457",
      "type": "folder",
      "name": "Q1",
      "itemCount": 8
    }
  ]
}
```

### 3.3 Tree View/Recursive Navigation

**Request:**
```http
GET /api/v1/folders/folder_123/tree?depth=3&includeFiles=true HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "folder_123",
  "name": "2024",
  "type": "folder",
  "children": [
    {
      "id": "folder_456",
      "name": "Financial Reports",
      "type": "folder",
      "children": [
        {
          "id": "file_001",
          "name": "10-K.pdf",
          "type": "file",
          "size": 2500000
        },
        {
          "id": "folder_457",
          "name": "Q1",
          "type": "folder",
          "children": [
            {
              "id": "file_002",
              "name": "Q1_Report.pdf",
              "type": "file",
              "size": 1500000
            }
          ]
        }
      ]
    },
    {
      "id": "folder_458",
      "name": "Tax Documents",
      "type": "folder",
      "children": []
    }
  ]
}
```

### 3.4 Move Files/Folders (Cross-Hierarchy)

**Request:**
```http
POST /api/v1/items/move HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "itemIds": ["file_001", "file_002"],
  "sourceFolderId": "folder_456",
  "destinationFolderId": "folder_789",
  "overwritePolicy": "skip"
}
```

**Response:**
```json
{
  "movedItems": 2,
  "skippedItems": 0,
  "results": [
    {
      "id": "file_001",
      "name": "10-K.pdf",
      "previousPath": "/documents/2024/Financial Reports/10-K.pdf",
      "newPath": "/documents/Archive/10-K.pdf",
      "status": "moved",
      "movedAt": "2025-11-13T13:00:00Z"
    },
    {
      "id": "file_002",
      "name": "10-Q.pdf",
      "previousPath": "/documents/2024/Financial Reports/10-Q.pdf",
      "newPath": "/documents/Archive/10-Q.pdf",
      "status": "moved",
      "movedAt": "2025-11-13T13:00:00Z"
    }
  ]
}
```

---

## 4. File Download Endpoints

### 4.1 Standard Download

**Request:**
```http
GET /api/v1/files/file_001/download HTTP/1.1
Authorization: Bearer <token>
```

**Response Headers:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="10-K.pdf"
Content-Length: 2500000
Cache-Control: no-cache
ETag: "abc123def456"
Last-Modified: Wed, 13 Nov 2025 10:00:00 GMT
Accept-Ranges: bytes
```

### 4.2 Inline Preview (Stream)

**Request:**
```http
GET /api/v1/files/file_001/preview?inline=true HTTP/1.1
Authorization: Bearer <token>
```

**Response Headers:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="10-K.pdf"
Content-Length: 2500000
```

### 4.3 Byte-Range Download (Resume)

**Request:**
```http
GET /api/v1/files/file_001/download HTTP/1.1
Range: bytes=0-1048576
Authorization: Bearer <token>
```

**Response:**
```
HTTP/1.1 206 Partial Content
Content-Type: application/pdf
Content-Range: bytes 0-1048576/2500000
Content-Length: 1048577
Accept-Ranges: bytes
```

### 4.4 Download with Format Conversion

**Request:**
```http
GET /api/v1/files/file_001/download?format=html HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: text/html
Content-Disposition: attachment; filename="10-K.html"
```

### 4.5 Batch Download (ZIP)

**Request:**
```http
POST /api/v1/files/batch-download HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "fileIds": ["file_001", "file_002", "file_003"],
  "includeFolder": true,
  "compressionFormat": "zip"
}
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="documents.zip"
Content-Length: 7500000
```

---

## 5. Search and Filtering Capabilities

### 5.1 Full-Text Search

**Request:**
```http
GET /api/v1/search?q=financial%20report&type=file&scope=global HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "query": "financial report",
  "results": [
    {
      "id": "file_001",
      "name": "2024 Financial Report.pdf",
      "type": "file",
      "path": "/documents/2024/2024 Financial Report.pdf",
      "mimeType": "application/pdf",
      "size": 2500000,
      "matchContext": "...quarterly <highlight>financial report</highlight> for investors...",
      "relevanceScore": 0.98,
      "createdAt": "2025-11-13T10:00:00Z"
    },
    {
      "id": "folder_456",
      "name": "Financial Reports",
      "type": "folder",
      "path": "/documents/2024/Financial Reports",
      "itemCount": 12,
      "relevanceScore": 0.85,
      "createdAt": "2025-11-01T09:00:00Z"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 20,
    "offset": 0
  }
}
```

### 5.2 Advanced Filtering

**Request:**
```http
GET /api/v1/files?filter=true HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "filters": {
    "mimeType": ["application/pdf", "application/vnd.ms-excel"],
    "size": {
      "min": 100000,
      "max": 10000000
    },
    "createdDate": {
      "from": "2025-01-01",
      "to": "2025-11-13"
    },
    "metadata": {
      "classification": "confidential",
      "department": ["Finance", "Legal"]
    },
    "createdBy": "user@example.com"
  },
  "sort": "createdAt",
  "order": "desc",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "file_001",
      "name": "10-K.pdf",
      "type": "file",
      "size": 2500000,
      "mimeType": "application/pdf",
      "createdAt": "2025-11-13T10:00:00Z",
      "createdBy": "user@example.com",
      "metadata": {
        "classification": "confidential",
        "department": "Finance"
      }
    }
  ],
  "totalResults": 45,
  "appliedFilters": {
    "mimeType": ["application/pdf", "application/vnd.ms-excel"],
    "classification": "confidential"
  }
}
```

### 5.3 Faceted Search

**Request:**
```http
GET /api/v1/search/facets?q=report HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "query": "report",
  "results": [...],
  "facets": {
    "type": [
      {
        "value": "file",
        "count": 156,
        "selected": false
      },
      {
        "value": "folder",
        "count": 8,
        "selected": false
      }
    ],
    "mimeType": [
      {
        "value": "application/pdf",
        "count": 98,
        "selected": false
      },
      {
        "value": "text/plain",
        "count": 34,
        "selected": false
      }
    ],
    "createdBy": [
      {
        "value": "user@example.com",
        "count": 78,
        "selected": false
      }
    ],
    "metadata.classification": [
      {
        "value": "confidential",
        "count": 134,
        "selected": false
      },
      {
        "value": "internal",
        "count": 22,
        "selected": false
      }
    ]
  }
}
```

### 5.4 Saved Searches/Filters

**Create Saved Search:**
```http
POST /api/v1/searches/save HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Confidential Financials 2024",
  "description": "All confidential financial documents from 2024",
  "query": "report",
  "filters": {
    "metadata.classification": "confidential",
    "createdDate": {
      "from": "2025-01-01",
      "to": "2025-12-31"
    }
  },
  "sort": "createdAt",
  "isPublic": false
}
```

**Response:**
```json
{
  "id": "search_123",
  "name": "Confidential Financials 2024",
  "createdAt": "2025-11-13T14:00:00Z",
  "createdBy": "user@example.com",
  "resultCount": 156
}
```

---

## 6. Metadata Handling

### 6.1 System Metadata

**Built-in Metadata:**
```json
{
  "id": "file_001",
  "name": "10-K.pdf",
  "type": "file",
  "parentFolderId": "folder_123",
  "path": "/documents/2024/10-K.pdf",
  "size": 2500000,
  "mimeType": "application/pdf",
  "createdAt": "2025-11-13T10:00:00Z",
  "createdBy": "user_001",
  "updatedAt": "2025-11-13T11:30:00Z",
  "updatedBy": "user_002",
  "lastAccessedAt": "2025-11-13T14:50:00Z",
  "accessCount": 47,
  "checksum": {
    "algorithm": "SHA256",
    "value": "abc123def456..."
  },
  "status": "active",
  "locked": false,
  "lockedBy": null
}
```

### 6.2 Custom Metadata

**Request to Add Custom Metadata:**
```http
PATCH /api/v1/files/file_001/metadata HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "customMetadata": {
    "classification": "confidential",
    "department": "Finance",
    "filingDate": "2025-11-13",
    "fiscalYear": "2024",
    "auditor": "Big Four Firm",
    "tags": ["annual", "10-K", "2024"],
    "retentionPolicy": "7years",
    "relatedItems": ["file_002", "folder_456"],
    "externalId": "SEC_10K_2024",
    "customFields": {
      "cik": "0000320193",
      "companyName": "Example Corp"
    }
  }
}
```

**Response:**
```json
{
  "id": "file_001",
  "name": "10-K.pdf",
  "metadata": {
    "classification": "confidential",
    "department": "Finance",
    "filingDate": "2025-11-13",
    "fiscalYear": "2024",
    "auditor": "Big Four Firm",
    "tags": ["annual", "10-K", "2024"],
    "retentionPolicy": "7years",
    "relatedItems": ["file_002", "folder_456"],
    "externalId": "SEC_10K_2024",
    "customFields": {
      "cik": "0000320193",
      "companyName": "Example Corp"
    }
  },
  "metadataLastUpdatedAt": "2025-11-13T15:00:00Z",
  "metadataUpdatedBy": "user@example.com"
}
```

### 6.3 Metadata Templates

**Create Metadata Template:**
```http
POST /api/v1/metadata-templates HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Financial Document Template",
  "description": "Standard metadata for financial documents",
  "fields": [
    {
      "name": "classification",
      "type": "enum",
      "required": true,
      "values": ["public", "internal", "confidential", "restricted"]
    },
    {
      "name": "department",
      "type": "enum",
      "required": true,
      "values": ["Finance", "Legal", "Compliance", "Executive"]
    },
    {
      "name": "filingDate",
      "type": "date",
      "required": true
    },
    {
      "name": "fiscalYear",
      "type": "string",
      "required": false,
      "pattern": "^20[0-9]{2}$"
    },
    {
      "name": "tags",
      "type": "array",
      "itemType": "string",
      "required": false
    }
  ]
}
```

**Response:**
```json
{
  "id": "template_001",
  "name": "Financial Document Template",
  "createdAt": "2025-11-13T15:30:00Z",
  "fields": [...]
}
```

### 6.4 Bulk Metadata Update

**Request:**
```http
POST /api/v1/batch/metadata-update HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "itemIds": ["file_001", "file_002", "file_003"],
  "metadata": {
    "classification": "confidential",
    "department": "Finance",
    "retentionPolicy": "7years"
  },
  "mergeStrategy": "merge"
}
```

**Response:**
```json
{
  "updatedItems": 3,
  "failedItems": 0,
  "results": [
    {
      "id": "file_001",
      "status": "updated",
      "updatedAt": "2025-11-13T15:45:00Z"
    },
    {
      "id": "file_002",
      "status": "updated",
      "updatedAt": "2025-11-13T15:45:00Z"
    },
    {
      "id": "file_003",
      "status": "updated",
      "updatedAt": "2025-11-13T15:45:00Z"
    }
  ]
}
```

---

## 7. Error Handling Patterns

### 7.1 Standard Error Response Format

```json
{
  "error": {
    "code": "INVALID_FILE_TYPE",
    "status": 400,
    "message": "File type 'exe' is not allowed for upload",
    "details": {
      "allowedTypes": ["pdf", "docx", "xlsx", "txt"],
      "providedType": "exe"
    },
    "timestamp": "2025-11-13T16:00:00Z",
    "requestId": "req_12345678",
    "documentationUrl": "https://api.example.com/docs/errors/INVALID_FILE_TYPE"
  }
}
```

### 7.2 Validation Errors

**Request:**
```http
POST /api/v1/files/upload HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "",
  "parentFolderId": "invalid_id"
}
```

**Response (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "status": 400,
    "message": "Request validation failed",
    "validationErrors": [
      {
        "field": "filename",
        "message": "Filename cannot be empty",
        "code": "REQUIRED"
      },
      {
        "field": "parentFolderId",
        "message": "Parent folder not found",
        "code": "NOT_FOUND"
      }
    ],
    "requestId": "req_12345678"
  }
}
```

### 7.3 File Size Limit Error

**Response (413 Payload Too Large):**
```json
{
  "error": {
    "code": "FILE_SIZE_EXCEEDED",
    "status": 413,
    "message": "File exceeds maximum allowed size",
    "details": {
      "maximumSizeBytes": 5368709120,
      "maximumSizeMB": 5120,
      "providedSizeBytes": 10737418240,
      "providedSizeMB": 10240,
      "exceedsByBytes": 5368709120
    },
    "requestId": "req_12345678"
  }
}
```

### 7.4 Conflict Error (Duplicate File)

**Response (409 Conflict):**
```json
{
  "error": {
    "code": "FILE_ALREADY_EXISTS",
    "status": 409,
    "message": "A file with this name already exists in the folder",
    "details": {
      "existingFileId": "file_existing_001",
      "filename": "report.pdf",
      "parentFolderId": "folder_123",
      "suggestedAlternativeNames": [
        "report (1).pdf",
        "report_2025-11-13.pdf"
      ]
    },
    "resolution": {
      "options": [
        "rename_file",
        "overwrite_existing",
        "use_different_folder"
      ]
    },
    "requestId": "req_12345678"
  }
}
```

### 7.5 Authorization Error

**Response (403 Forbidden):**
```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "status": 403,
    "message": "You do not have permission to access this resource",
    "details": {
      "requiredPermissions": ["read", "delete"],
      "grantedPermissions": ["read"],
      "missingPermissions": ["delete"],
      "resourceId": "file_001",
      "resourceType": "file"
    },
    "requestId": "req_12345678"
  }
}
```

### 7.6 Rate Limiting Error

**Response (429 Too Many Requests):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "status": 429,
    "message": "Too many requests. Please try again later.",
    "details": {
      "limit": 100,
      "window": "1 minute",
      "remaining": 0,
      "resetAt": "2025-11-13T16:02:00Z",
      "retryAfterSeconds": 120
    },
    "requestId": "req_12345678"
  }
}
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1731520920
Retry-After: 120
```

### 7.7 Server Error with Retry

**Response (500 Internal Server Error):**
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "status": 500,
    "message": "An unexpected error occurred while processing your request",
    "details": {
      "correlationId": "corr_abc123def456",
      "timestamp": "2025-11-13T16:00:00Z"
    },
    "retry": {
      "isRetryable": true,
      "recommendedDelay": 5,
      "maxAttempts": 3
    },
    "requestId": "req_12345678"
  }
}
```

### 7.8 Async Operation Status

**Request:**
```http
GET /api/v1/operations/op_12345 HTTP/1.1
Authorization: Bearer <token>
```

**Response (Still Processing):**
```json
{
  "operationId": "op_12345",
  "type": "batch_delete",
  "status": "in_progress",
  "progress": {
    "completed": 45,
    "total": 100,
    "percentage": 45,
    "startedAt": "2025-11-13T15:50:00Z",
    "estimatedCompletionAt": "2025-11-13T16:05:00Z"
  }
}
```

**Response (Completed):**
```json
{
  "operationId": "op_12345",
  "type": "batch_delete",
  "status": "completed",
  "result": {
    "deletedItems": 100,
    "failedItems": 0,
    "completedAt": "2025-11-13T16:04:30Z"
  }
}
```

---

## 8. Authentication and Authorization

### 8.1 Bearer Token Authentication

**Request with Bearer Token:**
```http
GET /api/v1/files/file_001 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Structure (JWT Example):**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_001",
    "email": "user@example.com",
    "iat": 1731517200,
    "exp": 1731603600,
    "permissions": [
      "file:read",
      "file:write",
      "folder:read",
      "folder:write"
    ],
    "scopes": ["filesystem", "admin"],
    "organizationId": "org_123"
  }
}
```

### 8.2 API Key Authentication

**Request with API Key:**
```http
GET /api/v1/files HTTP/1.1
X-API-Key: sk_live_abc123def456...
X-API-Version: v1
```

### 8.3 OAuth 2.0 Flow

**Authorization Request:**
```http
GET https://auth.example.com/oauth/authorize?
  client_id=client_123&
  redirect_uri=https://app.example.com/callback&
  response_type=code&
  scope=filesystem%20profile&
  state=random_state_123 HTTP/1.1
```

**Token Exchange:**
```http
POST https://auth.example.com/oauth/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=auth_code_xyz&
client_id=client_123&
client_secret=secret_xyz&
redirect_uri=https://app.example.com/callback
```

**Token Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_token_xyz...",
  "scope": "filesystem profile"
}
```

### 8.4 Role-Based Access Control (RBAC)

**File Permissions Model:**
```json
{
  "fileId": "file_001",
  "name": "10-K.pdf",
  "owner": "user_001",
  "acl": [
    {
      "principalId": "user_002",
      "principalType": "user",
      "permissions": ["read", "download"],
      "grantedAt": "2025-11-13T10:00:00Z",
      "grantedBy": "user_001"
    },
    {
      "principalId": "group_finance",
      "principalType": "group",
      "permissions": ["read", "write", "download", "delete"],
      "grantedAt": "2025-11-13T10:00:00Z"
    },
    {
      "principalId": "role_auditor",
      "principalType": "role",
      "permissions": ["read", "download"],
      "grantedAt": "2025-11-13T10:00:00Z"
    }
  ],
  "publicAccess": "none"
}
```

### 8.5 Share with Permissions

**Create Share Link:**
```http
POST /api/v1/files/file_001/share HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "recipients": [
    {
      "email": "colleague@example.com",
      "permissions": ["read", "download"]
    }
  ],
  "expiresAt": "2025-12-13T16:00:00Z",
  "allowedActions": [
    "view",
    "download"
  ],
  "password": null,
  "trackingEnabled": true,
  "notifyRecipients": true,
  "message": "Please review the attached financial report"
}
```

**Response:**
```json
{
  "shareId": "share_001",
  "fileId": "file_001",
  "sharedBy": "user@example.com",
  "sharedAt": "2025-11-13T16:15:00Z",
  "recipients": [
    {
      "email": "colleague@example.com",
      "permissions": ["read", "download"],
      "status": "pending",
      "inviteSentAt": "2025-11-13T16:15:00Z"
    }
  ],
  "expiresAt": "2025-12-13T16:00:00Z",
  "shareLink": "https://share.example.com/s/abc123xyz",
  "accessCount": 0
}
```

### 8.6 Public Share with Token

**Generate Public Share:**
```http
POST /api/v1/files/file_001/public-share HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "permissions": ["read", "download"],
  "expiresAt": "2025-12-13T16:00:00Z",
  "password": "SecurePass123!",
  "allowedDomains": ["example.com"],
  "downloadLimit": 10
}
```

**Response:**
```json
{
  "shareToken": "share_token_abc123xyz",
  "shareUrl": "https://api.example.com/public/share/abc123xyz",
  "expiresAt": "2025-12-13T16:00:00Z",
  "downloadLimit": 10,
  "downloadsRemaining": 10,
  "passwordProtected": true
}
```

**Public Access (No Token):**
```http
GET https://api.example.com/public/share/abc123xyz?password=SecurePass123 HTTP/1.1
```

### 8.7 File Locking

**Lock File (Prevent Modifications):**
```http
POST /api/v1/files/file_001/lock HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{
  "reason": "File under review",
  "expiresAt": "2025-11-20T16:00:00Z"
}
```

**Response:**
```json
{
  "fileId": "file_001",
  "locked": true,
  "lockedBy": "user@example.com",
  "lockedAt": "2025-11-13T16:20:00Z",
  "reason": "File under review",
  "expiresAt": "2025-11-20T16:00:00Z"
}
```

### 8.8 Audit Trail/Access Logs

**Request Access History:**
```http
GET /api/v1/files/file_001/audit-log?limit=50&offset=0 HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "fileId": "file_001",
  "auditLog": [
    {
      "id": "log_001",
      "action": "download",
      "actor": {
        "id": "user_002",
        "email": "colleague@example.com",
        "name": "John Doe"
      },
      "timestamp": "2025-11-13T16:25:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "details": {
        "fileSize": 2500000,
        "duration": "5 seconds"
      }
    },
    {
      "id": "log_002",
      "action": "metadata_update",
      "actor": {
        "id": "user_001",
        "email": "user@example.com"
      },
      "timestamp": "2025-11-13T15:30:00Z",
      "details": {
        "changedFields": ["classification", "retentionPolicy"],
        "oldValues": {
          "classification": "internal"
        },
        "newValues": {
          "classification": "confidential"
        }
      }
    },
    {
      "id": "log_003",
      "action": "shared",
      "actor": {
        "id": "user_001",
        "email": "user@example.com"
      },
      "timestamp": "2025-11-13T14:00:00Z",
      "details": {
        "sharedWith": "colleague@example.com",
        "permissions": ["read", "download"]
      }
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Summary: Best Practices Checklist

### API Design
- [ ] Use semantic versioning (`/api/v1/`)
- [ ] Use correct HTTP verbs (GET, POST, PATCH, DELETE)
- [ ] Return appropriate HTTP status codes
- [ ] Implement request/response pagination
- [ ] Use content negotiation (Accept headers)
- [ ] Provide request IDs for tracking

### File Operations
- [ ] Support chunked uploads for large files
- [ ] Implement resumable uploads
- [ ] Use checksums for integrity validation
- [ ] Support byte-range downloads
- [ ] Handle file locking for concurrent access
- [ ] Provide soft delete with recovery

### Data Integrity
- [ ] Calculate and verify checksums (SHA256)
- [ ] Implement optimistic locking (ETags)
- [ ] Validate file types and sizes
- [ ] Prevent directory traversal attacks
- [ ] Maintain audit logs for compliance

### Performance
- [ ] Implement pagination (20-100 items per page)
- [ ] Add filtering and searching
- [ ] Use compression for responses
- [ ] Cache metadata appropriately
- [ ] Support batch operations
- [ ] Implement rate limiting

### Security
- [ ] Require authentication for all endpoints
- [ ] Implement granular authorization
- [ ] Use HTTPS/TLS for all requests
- [ ] Validate and sanitize inputs
- [ ] Implement CORS appropriately
- [ ] Log all access and modifications

### Error Handling
- [ ] Use consistent error response format
- [ ] Include error codes and request IDs
- [ ] Provide helpful error messages
- [ ] Include validation details
- [ ] Suggest recovery actions
- [ ] Document rate limits

### Documentation
- [ ] Provide OpenAPI/Swagger specifications
- [ ] Include request/response examples
- [ ] Document all error codes
- [ ] Explain permission requirements
- [ ] Provide code samples
- [ ] Document rate limits and quotas
