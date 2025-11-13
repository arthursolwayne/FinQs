# File Storage System - Quick Reference Guide

## 1. Local Filesystem Organization

### Content-Addressable Storage (Recommended)
```
storage/ab/cdef1234567890.../data
├── ab/ → first 2 hex chars
├── cd/ → next 2 hex chars
└── ef... → remaining hash
```

**Formula for sharding depth:**
```
Depth = ceil(log(file_count / max_per_dir, 256))
- 1M files:   2 levels needed
- 100M files: 3 levels needed
- 1B files:   4 levels needed
```

### Time-Based Organization (Alternative)
```
storage/2025/11/13/user_1/file.pdf
```

### Recommended Filesystem
- **Linux**: ext4 (64-bit, reliable)
- **Scale**: Set inode ratio (-i 2048 for many small files)

---

## 2. Database Schema Quick Reference

### PostgreSQL (Recommended)

**Core Tables:**
```sql
files(
  id UUID PRIMARY KEY,
  user_id UUID,
  parent_id UUID,
  name VARCHAR(255),
  file_hash VARCHAR(64),
  file_size BIGINT,
  is_deleted BOOLEAN,
  is_folder BOOLEAN
)

file_versions(
  id UUID PRIMARY KEY,
  file_id UUID,
  version_number INT,
  file_hash VARCHAR(64),
  storage_path VARCHAR(500)
)
```

**Essential Indexes:**
```sql
-- Fast lookups by user
CREATE INDEX idx_user_not_deleted ON files(user_id) WHERE NOT is_deleted;

-- Fast parent navigation
CREATE INDEX idx_parent_not_deleted ON files(parent_id) WHERE NOT is_deleted;

-- Duplicate detection
CREATE INDEX idx_files_hash ON files(file_hash);

-- Text search
CREATE INDEX idx_files_name_trgm ON files USING GIN(name gin_trgm_ops);
```

### SQLite (Embedded)
```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    parent_id TEXT,
    name TEXT NOT NULL,
    file_hash TEXT,
    file_size INTEGER,
    is_deleted INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### MongoDB (Document)
```javascript
db.files.insertOne({
    _id: ObjectId(),
    userId: ObjectId(),
    parentId: ObjectId(),
    name: "document.pdf",
    fileHash: "abc123...",
    fileSize: 1024000,
    isDeleted: false,
    createdAt: new Date()
})
```

---

## 3. File Versioning

### Snapshot Model (Simple, Recommended)
```python
# Create version by storing complete file copy
v1 → storage/versions/file-id/v1/hash
v2 → storage/versions/file-id/v2/hash
v3 → storage/versions/file-id/v3/hash
```

### Delta Model (Space Efficient)
```python
# Store only differences
base   → storage/file-id/base
delta1 → storage/file-id/delta1.diff
delta2 → storage/file-id/delta2.diff
```

**Retention Policy:**
```sql
-- Keep last 10 versions
DELETE FROM file_versions
WHERE version_number NOT IN (
    SELECT version_number FROM file_versions
    WHERE file_id = $1
    ORDER BY version_number DESC
    LIMIT 10
)
```

---

## 4. Folder Hierarchy

### Closure Table Pattern (Recommended)
```sql
-- Store all ancestor-descendant pairs
CREATE TABLE folder_hierarchy (
    ancestor_id UUID,
    descendant_id UUID,
    depth INT
);

-- Query: Get all files in folder (including subfolders)
SELECT * FROM files
WHERE id IN (
    SELECT descendant_id FROM folder_hierarchy
    WHERE ancestor_id = $1
)
```

### Recursive CTE Pattern (Universal)
```sql
WITH RECURSIVE path AS (
    SELECT id, parent_id, 1 as depth FROM files WHERE id = $1
    UNION ALL
    SELECT f.id, f.parent_id, p.depth + 1
    FROM files f JOIN path p ON f.parent_id = p.id
)
SELECT * FROM path
```

### ltree Pattern (PostgreSQL Only)
```sql
-- Use PostgreSQL's ltree type
CREATE TABLE files (
    path ltree NOT NULL UNIQUE
);

-- Query descendants
SELECT * FROM files WHERE path <@ 'a.b.c'
```

---

## 5. ID Strategies

### UUID (Scalable)
```python
import uuid
file_id = uuid.uuid4()  # 36 bytes, non-sequential
# Use in: Distributed systems, public APIs
```

### Sequential (Fast)
```python
file_id = await db.execute(
    "INSERT INTO files DEFAULT VALUES RETURNING id"
)
# Use in: Single server, high performance needs
```

### Hybrid (Best of Both)
```python
file_uuid = uuid.uuid4()           # Internal
friendly_id = f"{user_id}_{ts}"    # External API
# Use in: Medium scale, need human-readable IDs
```

### Short IDs (URL Safe)
```python
import secrets
import base64
short_id = base64.urlsafe_b64encode(
    secrets.token_bytes(12)
).decode().rstrip('=')
# Result: ~16 character URL-safe string
```

---

## 6. Soft vs Hard Delete

### Soft Delete (Recommended)
```sql
-- Mark as deleted, keep data
UPDATE files SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1;

-- Restore
UPDATE files SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1;

-- Query (exclude deleted)
SELECT * FROM files WHERE NOT is_deleted;

-- Purge after 90 days
DELETE FROM files WHERE is_deleted AND deleted_at < NOW() - INTERVAL '90 days';
```

### Hard Delete (Privacy Critical)
```sql
-- Permanently remove
DELETE FROM files WHERE id = $1;
DELETE FROM file_versions WHERE file_id = $1;

-- Secure file deletion (overwrite before delete)
os.urandom(file_size)  # Random data
b'\x00' * file_size    # Zeros
b'\xFF' * file_size    # Ones
os.remove(filepath)
```

---

## 7. Duplicate File Handling

### Detection
```python
# Find duplicates by hash
SELECT file_hash, COUNT(*) as count,
       array_agg(id) as file_ids,
       SUM(file_size) * (COUNT(*) - 1) as space_wasted
FROM files
WHERE NOT is_deleted
GROUP BY file_hash
HAVING COUNT(*) > 1
ORDER BY space_wasted DESC
```

### Deduplication Methods

**1. Content-Addressable Storage (Automatic)**
```python
# All identical files stored once
file_hash = sha256(content)
storage_path = f"cas/{file_hash[:2]}/{file_hash[2:]}"
# Multiple DB records point to same storage path
```

**2. Hard Links (Filesystem)**
```bash
ln original.txt duplicate.txt  # Hard link (save space)
```

**3. Reference Pointing (Database)**
```sql
-- Store reference to original
UPDATE files SET original_file_id = $1 WHERE id = $2
```

---

## 8. Indexing Strategy for Search

### PostgreSQL Indexes by Use Case

**For Exact Lookups:**
```sql
CREATE INDEX ON files(user_id, created_at DESC);
CREATE INDEX ON files(file_hash);
```

**For Pattern Matching (Names):**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON files USING GIN(name gin_trgm_ops);
```

**For Full-Text Search:**
```sql
CREATE INDEX ON files
  USING GIN(to_tsvector('english', name));

SELECT * FROM files
WHERE to_tsvector('english', name) @@ plainto_tsquery('english', 'budget');
```

**For JSON Metadata:**
```sql
CREATE INDEX ON files USING GIN(metadata);

SELECT * FROM files
WHERE metadata @> '{"department": "finance"}'::jsonb;
```

**For Array Tags:**
```sql
CREATE INDEX ON files USING GIN(tags);

SELECT * FROM files WHERE tags && ARRAY['urgent', 'review'];
```

### Index Optimization

```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Drop unused indexes
DROP INDEX idx_unused;

-- Analyze query plans
EXPLAIN ANALYZE
SELECT * FROM files WHERE name ILIKE '%search%';
```

### Elasticsearch (For Large Scale)
```python
# Index creation
es.indices.create(index='files', body={
    "settings": {
        "number_of_shards": 10,
        "number_of_replicas": 2
    },
    "mappings": {
        "properties": {
            "name": {
                "type": "text",
                "analyzer": "standard",
                "fields": {"keyword": {"type": "keyword"}}
            },
            "file_size": {"type": "long"},
            "created_at": {"type": "date"},
            "tags": {"type": "keyword"}
        }
    }
})

# Search
results = es.search(index='files', body={
    "query": {
        "multi_match": {
            "query": "quarterly report",
            "fields": ["name^3", "path"]
        }
    }
})
```

---

## Quick Decision Table

### When to Use What

| Requirement | Solution |
|-------------|----------|
| **Store metadata** | PostgreSQL with indexes |
| **Store files** | S3 / Local FS with sharding |
| **Detect duplicates** | File hash + database query |
| **Search files** | PostgreSQL GIST/GIN (< 10M) or Elasticsearch (> 10M) |
| **Handle versions** | Database snapshots (simple) or delta storage (space efficient) |
| **Delete safely** | Soft delete + 90-day retention |
| **Scale to 1B files** | Sharded PostgreSQL + Elasticsearch + CAS |
| **Mobile app** | SQLite + S3, sync with server |
| **Single server** | SQLite + Local FS, easy to setup |

---

## Performance Targets

### Latency (by system scale)

| Operation | Tier 1 (SQLite) | Tier 2 (PostgreSQL) | Tier 3 (Sharded) |
|-----------|-----------------|-------------------|------------------|
| Upload 10MB | 5-10s | 1-2s | 500ms-1s |
| Download 10MB | 2-5s | 500ms | 100-200ms |
| List folder (1K files) | 200ms | 50ms | 20ms |
| Search (1M files) | 2-5s | 200-500ms | 50-100ms |

### Throughput

| Metric | Target |
|--------|--------|
| Concurrent uploads | 10-50 (Tier 1), 100-500 (Tier 2), 1000+ (Tier 3) |
| Requests/second | 10-50 (Tier 1), 500-2000 (Tier 2), 5000+ (Tier 3) |
| File storage | 1-100GB (Tier 1), 100GB-10TB (Tier 2), 10TB+ (Tier 3) |

---

## Common Queries

### Get file with full path
```sql
WITH RECURSIVE path_builder AS (
    SELECT id, parent_id, name, 1 as depth
    FROM files WHERE id = $1
    UNION ALL
    SELECT f.id, f.parent_id, f.name, pb.depth + 1
    FROM files f JOIN path_builder pb ON f.id = pb.parent_id
)
SELECT string_agg(name, '/' ORDER BY depth DESC) as full_path
FROM path_builder
```

### List folder contents (with counts)
```sql
SELECT
  id, name, is_folder,
  CASE WHEN is_folder THEN
    (SELECT COUNT(*) FROM files WHERE parent_id = f.id)
  ELSE NULL END as item_count
FROM files f
WHERE parent_id = $1 AND NOT is_deleted
ORDER BY is_folder DESC, name ASC
```

### Find duplicate files
```sql
SELECT f1.id, f1.name, f2.id, f2.name, f1.file_size
FROM files f1
JOIN files f2 ON f1.file_hash = f2.file_hash
WHERE f1.id < f2.id
AND f1.file_size = f2.file_size
AND NOT f1.is_deleted
AND NOT f2.is_deleted
```

### Storage usage by user
```sql
SELECT
  user_id,
  COUNT(*) as file_count,
  SUM(file_size) as total_size,
  SUM(file_size) FILTER (WHERE NOT is_deleted) as active_size
FROM files
GROUP BY user_id
ORDER BY total_size DESC
```

---

## Deployment Checklist

### Before Going to Production

- [ ] Database backups automated and tested
- [ ] S3 buckets secured with policies
- [ ] File upload validation (extension, size, MIME type)
- [ ] Malware scanning enabled
- [ ] Rate limiting on upload endpoints
- [ ] HTTPS/TLS enabled
- [ ] Database indexes created and analyzed
- [ ] Query performance profiled (slow queries < 100ms)
- [ ] Monitoring alerts configured
- [ ] Disaster recovery plan documented
- [ ] Data retention policy implemented
- [ ] GDPR/compliance requirements met
- [ ] User data export functionality working
- [ ] Soft delete and trash working correctly
- [ ] Audit logging enabled

---

## Resource Links

### Database Optimization
- PostgreSQL Index Docs: https://www.postgresql.org/docs/current/indexes.html
- Query Planning: https://www.postgresql.org/docs/current/using-explain.html

### Storage Solutions
- S3 Best Practices: https://docs.aws.amazon.com/s3/latest/userguide/
- MinIO: https://min.io/docs/

### Search
- Elasticsearch: https://www.elastic.co/guide/en/elasticsearch/reference/
- PostgreSQL Full-Text: https://www.postgresql.org/docs/current/textsearch.html

### Tools
- pgBouncer (Connection Pooling): https://www.pgbouncer.org/
- Redis: https://redis.io/docs/

---

## Next Steps

1. **Start with Tier 1** if MVP/POC
2. **Migrate to Tier 2** when files > 100K or users > 50
3. **Upgrade to Tier 3** when reaching 100M files or 1000+ users

See SCALE_DECISION_MATRIX.md for detailed guidance.
