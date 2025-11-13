# REST API Quick Reference Guide
## Essential Endpoints for Dataroom Filesystem

---

## Core Endpoints Reference

### Files Management

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/files/upload` | Simple file upload | `file:write` |
| POST | `/api/v1/files/upload/initiate` | Start chunked upload | `file:write` |
| POST | `/api/v1/files/upload/{uploadId}/chunk` | Upload file chunk | `file:write` |
| POST | `/api/v1/files/upload/{uploadId}/complete` | Complete chunked upload | `file:write` |
| GET | `/api/v1/files/upload/{uploadId}/status` | Get upload progress | `file:write` |
| GET | `/api/v1/files/{fileId}` | Get file metadata | `file:read` |
| GET | `/api/v1/files/{fileId}/download` | Download file | `file:read` |
| GET | `/api/v1/files/{fileId}/download-watermarked` | Download with watermark | `file:read` |
| GET | `/api/v1/files/{fileId}/preview` | Preview file (inline) | `file:read` |
| PATCH | `/api/v1/files/{fileId}` | Update file metadata | `file:write` |
| POST | `/api/v1/files/{fileId}/copy` | Copy file | `file:write` |
| DELETE | `/api/v1/files/{fileId}` | Delete file (soft delete) | `file:delete` |
| POST | `/api/v1/files/{fileId}/new-version` | Upload new version | `file:write` |
| GET | `/api/v1/files/{fileId}/versions` | Get version history | `file:read` |
| POST | `/api/v1/files/{fileId}/restore-version/{versionId}` | Restore previous version | `file:write` |

### Folders Management

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/folders` | Create folder | `folder:write` |
| GET | `/api/v1/folders` | List root folders | `folder:read` |
| GET | `/api/v1/folders/{folderId}` | Get folder metadata | `folder:read` |
| GET | `/api/v1/folders/{folderId}/items` | List folder contents | `folder:read` |
| GET | `/api/v1/folders/{folderId}/tree` | Get folder tree (recursive) | `folder:read` |
| GET | `/api/v1/navigation/path` | Navigate by path | `folder:read` |
| GET | `/api/v1/folders/{folderId}/breadcrumbs` | Get breadcrumb trail | `folder:read` |
| PATCH | `/api/v1/folders/{folderId}` | Update folder metadata | `folder:write` |
| DELETE | `/api/v1/folders/{folderId}` | Delete folder | `folder:delete` |
| POST | `/api/v1/folders/{folderId}/copy` | Copy folder (recursive) | `folder:write` |

### Search & Discovery

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/search` | Full-text search | `file:read` |
| GET | `/api/v1/search/facets` | Get search facets | `file:read` |
| POST | `/api/v1/searches/save` | Save search query | `file:read` |
| GET | `/api/v1/saved-searches` | List saved searches | `file:read` |

### Sharing & Access Control

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/files/{fileId}/share` | Share with users | `file:share` |
| POST | `/api/v1/files/{fileId}/public-share` | Create public share link | `file:share` |
| GET | `/api/v1/public/share/{shareToken}` | Access public share | None |
| POST | `/api/v1/files/{fileId}/share-expiring` | Share with expiration | `file:share` |
| GET | `/api/v1/public/access/{shareLink}/file` | Access expiring share | None |
| GET | `/api/v1/items/{itemId}/permissions` | Get item permissions | `file:read` |
| PUT | `/api/v1/items/{itemId}/permissions` | Update permissions | `file:admin` |

### Bulk Operations

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/batch/move` | Move multiple items | `file:write` |
| POST | `/api/v1/batch/delete` | Delete multiple items | `file:delete` |
| POST | `/api/v1/batch/copy` | Copy multiple items | `file:write` |
| POST | `/api/v1/files/batch-download` | Download as ZIP | `file:read` |
| POST | `/api/v1/batch/metadata-update` | Bulk metadata update | `file:write` |

### Metadata & Classification

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/files/{fileId}/metadata` | Get all metadata | `file:read` |
| PATCH | `/api/v1/files/{fileId}/metadata` | Update custom metadata | `file:write` |
| POST | `/api/v1/metadata-templates` | Create metadata template | `metadata:admin` |
| GET | `/api/v1/metadata-templates` | List templates | `metadata:admin` |

### Audit & Compliance

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/files/{fileId}/audit-log` | Get file access log | `audit:read` |
| GET | `/api/v1/audit/logs` | Query audit logs | `audit:read` |
| GET | `/api/v1/audit/report/compliance` | Generate compliance report | `audit:read` |

### File Locking & Status

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/files/{fileId}/lock` | Lock file | `file:write` |
| DELETE | `/api/v1/files/{fileId}/lock` | Unlock file | `file:write` |
| GET | `/api/v1/files/{fileId}/lock-status` | Get lock status | `file:read` |

---

## Common Request/Response Patterns

### Success Response Format
```json
{
  "id": "uuid",
  "name": "string",
  "createdAt": "2025-11-13T16:00:00Z",
  "status": "success"
}
```

### Error Response Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "status": 400,
    "message": "Human readable message",
    "requestId": "req_uuid",
    "details": {
      "field": "Additional error details"
    }
  }
}
```

### Pagination Pattern
```json
{
  "results": [...],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Standard HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Request succeeded, returning data |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request succeeded, no data to return |
| 206 | Partial Content | Byte-range download |
| 400 | Bad Request | Validation error, missing fields |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists, conflict |
| 410 | Gone | Resource expired or permanently deleted |
| 413 | Payload Too Large | File size exceeds limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected server error |

---

## Common Query Parameters

```
/api/v1/items?
  limit=20                    # Results per page (default: 20, max: 100)
  offset=0                    # Skip N results
  sort=createdAt              # Sort field
  order=desc                  # asc or desc
  filter=true                 # Enable filtering
  q=search_term              # Full-text search query
```

---

## Request Headers

```
Authorization: Bearer <JWT_TOKEN>        # Required for most endpoints
Content-Type: application/json           # For JSON bodies
X-API-Key: <API_KEY>                    # Alternative auth method
X-Chunk-Number: 1                        # For chunked uploads
X-Chunk-Size: 5242880                   # For chunked uploads
Range: bytes=0-1048576                  # For partial downloads
Accept: application/json                 # Response format
```

---

## Response Headers

```
X-Request-ID: req_uuid                   # Unique request identifier
X-RateLimit-Limit: 100                   # Requests allowed per window
X-RateLimit-Remaining: 95                # Remaining requests
X-RateLimit-Reset: 1731517200            # Unix timestamp when limit resets
Content-Range: bytes 0-1048576/2500000  # For partial downloads
ETag: "abc123def456"                     # For caching
Last-Modified: Wed, 13 Nov 2025 10:00:00 GMT
Accept-Ranges: bytes                     # Supports range requests
Cache-Control: no-cache                  # Caching directives
```

---

## Error Code Reference

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `INVALID_FILE_TYPE` | File type not allowed | 400 |
| `FILE_SIZE_EXCEEDED` | File exceeds max size | 413 |
| `FILE_ALREADY_EXISTS` | Duplicate filename | 409 |
| `FILE_NOT_FOUND` | File does not exist | 404 |
| `FOLDER_NOT_FOUND` | Folder does not exist | 404 |
| `INSUFFICIENT_PERMISSIONS` | User lacks permission | 403 |
| `UNAUTHORIZED` | Missing/invalid auth | 401 |
| `INVALID_TOKEN` | JWT token invalid | 403 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `VALIDATION_ERROR` | Request validation failed | 400 |
| `UPLOAD_SESSION_NOT_FOUND` | Chunked upload session not found | 404 |
| `UPLOAD_SESSION_EXPIRED` | Upload session has expired | 410 |
| `INCOMPLETE_UPLOAD` | Not all chunks received | 400 |
| `CHECKSUM_MISMATCH` | File integrity check failed | 400 |
| `INTERNAL_SERVER_ERROR` | Unexpected server error | 500 |
| `MALWARE_DETECTED` | File contains malware | 400 |
| `GDPR_COMPLIANCE_ERROR` | Data retention policy violation | 403 |

---

## Authentication Examples

### Bearer Token
```http
GET /api/v1/files/file_001 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key
```http
GET /api/v1/files HTTP/1.1
X-API-Key: sk_live_abc123def456...
```

### Public Share Link
```http
GET /api/v1/public/share/abc123xyz?password=pass123
```

---

## Common Workflows

### 1. Upload Large File (Chunked)
```
1. POST /api/v1/files/upload/initiate          → Get uploadId
2. POST /api/v1/files/upload/{uploadId}/chunk  → Upload chunk 1
3. POST /api/v1/files/upload/{uploadId}/chunk  → Upload chunk 2
4. ... repeat for all chunks
5. POST /api/v1/files/upload/{uploadId}/complete → Finalize
```

### 2. Download File with Watermark
```
1. GET /api/v1/files/{fileId}/download-watermarked
   → Returns file with user watermark applied
   → Audit log created automatically
```

### 3. Share File with Expiration
```
1. POST /api/v1/files/{fileId}/share-expiring
   → Set expiresAt, maxDownloads
   → Returns shareable link
2. Recipient uses link to access
   → Access count tracked
   → Automatically expires
```

### 4. Search with Filters
```
GET /api/v1/search?q=report&classification=confidential&minSize=1000000
```

### 5. Restore Previous Version
```
1. GET /api/v1/files/{fileId}/versions  → Get version list
2. POST /api/v1/files/{fileId}/restore-version/{versionId}
   → Previous version restored
   → Current version moved to history
   → Audit log created
```

---

## Performance Tips

### For Clients
- Use chunked uploads for files > 100MB
- Use HTTP caching headers (ETag)
- Implement exponential backoff for retries
- Batch operations when possible
- Use Range requests for resumable downloads

### For Server
- Create database indexes on frequently queried fields
- Implement Redis caching for metadata queries
- Use CDN for file delivery
- Compress responses with gzip
- Implement connection pooling for database

---

## Security Checklist

- [ ] All endpoints require authentication
- [ ] Implement rate limiting (100 req/min per user)
- [ ] Use HTTPS/TLS only (enforced)
- [ ] Validate file types (whitelist approach)
- [ ] Encrypt files at rest (AES-256)
- [ ] Log all access and modifications
- [ ] Implement proper CORS headers
- [ ] Sanitize file names and paths
- [ ] Scan uploads for malware
- [ ] Implement file locking for in-progress edits
- [ ] Track file versions for compliance
- [ ] Apply document watermarks for sensitive files
- [ ] Support expiring share links
- [ ] Implement granular permissions (ACL)
- [ ] Generate audit trail reports

---

## Limits & Quotas

| Resource | Limit | Notes |
|----------|-------|-------|
| File size | 5GB | Per file upload |
| Upload timeout | 24 hours | Chunked upload session |
| Chunk size | 5MB recommended | Configurable |
| Request rate | 100/min | Per authenticated user |
| Search results | 100 max | Per query |
| Batch operations | 1000 items | Per request |
| API response | 10MB max | Compressed |
| Folder depth | 100 levels | Recommended max |
| File retention | 30 days | After soft delete |

---

## Example cURL Commands

### Upload File
```bash
curl -X POST https://api.example.com/api/v1/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "parentFolderId=folder_123"
```

### Download File
```bash
curl -X GET https://api.example.com/api/v1/files/file_001/download \
  -H "Authorization: Bearer $TOKEN" \
  -o document.pdf
```

### Search Files
```bash
curl "https://api.example.com/api/v1/search?q=report&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Folder
```bash
curl -X POST https://api.example.com/api/v1/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "2024 Reports",
    "parentFolderId": "folder_123"
  }'
```

### Share File
```bash
curl -X POST https://api.example.com/api/v1/files/file_001/share \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      {
        "email": "colleague@example.com",
        "permissions": ["read", "download"]
      }
    ],
    "expiresAt": "2025-12-13T16:00:00Z"
  }'
```

### Get Audit Log
```bash
curl "https://api.example.com/api/v1/files/file_001/audit-log?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```
