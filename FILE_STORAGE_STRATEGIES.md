# File Storage Strategies for Production Filesystem Applications

## Executive Summary

This document provides comprehensive research and recommendations for building a production-ready filesystem application covering storage organization, metadata management, version control, hierarchy storage, ID strategies, deletion policies, duplicate handling, and search optimization.

---

## 1. Local Filesystem Storage Organization

### Best Practices

#### 1.1 Directory Structure Patterns

**Pattern A: Content-Addressable Storage (CAS) - Recommended for Large Scale**
```
storage/
├── objects/
│   ├── ab/
│   │   ├── cdef1234567890...
│   │   └── cdef5678901234...
│   ├── cd/
│   ├── ef/
│   └── ...
├── temp/
│   └── uploads/
├── metadata/
│   └── index.db
└── logs/
```

**Advantages:**
- Hash-based storage prevents duplicates automatically
- Enables deduplication at storage layer
- Flat directory trees prevent inode exhaustion
- Parallel access to multiple shards
- Works well with distributed systems

**Implementation:**
```python
import hashlib
import os

def compute_file_hash(filepath: str, algorithm: str = 'sha256') -> str:
    """Compute hash of file for content-addressable storage"""
    hash_obj = hashlib.new(algorithm)
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            hash_obj.update(chunk)
    return hash_obj.hexdigest()

def get_storage_path(file_hash: str, shard_depth: int = 2) -> str:
    """Convert hash to storage path with sharding"""
    # Example: sha256_hash -> ab/cdef1234567890...
    parts = [file_hash[i:i+2] for i in range(0, shard_depth*2, 2)]
    remainder = file_hash[shard_depth*2:]
    return os.path.join(*parts, remainder)

# Usage
file_hash = compute_file_hash('/path/to/file.pdf')
storage_path = get_storage_path(file_hash)
# Result: "ab/cdef1234567890abcdef1234567890..."
```

**Pattern B: Time-Based Organization**
```
storage/
├── 2025/
│   ├── 11/
│   │   ├── 13/
│   │   │   ├── user_1/
│   │   │   └── user_2/
│   │   └── 12/
│   └── 12/
├── temp/
└── metadata/
```

**Advantages:**
- Easy to manage storage by time period
- Natural cleanup/archival boundaries
- Good for data retention policies
- Better for filesystem performance (fewer files per directory)

**Pattern C: User-Centric Organization**
```
storage/
├── users/
│   ├── user_1/
│   │   ├── documents/
│   │   ├── projects/
│   │   └── shared/
│   ├── user_2/
│   └── ...
├── shared_buckets/
├── temp/
└── metadata/
```

**Advantages:**
- Simple permission model
- Easy user quotas
- Clear ownership
- Good for collaborative systems

#### 1.2 Directory Depth Recommendations

**For most systems:**
- Keep maximum 20,000 files per directory
- Limit directory depth to 4-6 levels
- Use shard size of 2-4 characters (4-256 subdirectories per level)

**Formula for sharding:**
```python
def calculate_optimal_shard_depth(expected_files: int, max_per_dir: int = 20000) -> int:
    """Calculate shard depth needed"""
    import math
    if expected_files <= max_per_dir:
        return 0
    # Each shard level adds a factor of 256 (for hex) or 256^n for n-char shards
    shard_breadth = 256  # 00-FF
    return math.ceil(math.log(expected_files / max_per_dir, shard_breadth))

# Examples:
# 1M files:     2 levels needed (256 * 256 = 65k per level)
# 100M files:   3 levels needed
# 1B files:     4 levels needed
```

#### 1.3 Filesystem Considerations

**Filesystem Selection:**

| Filesystem | Inode Limit | Best For | Drawbacks |
|-----------|------------|----------|-----------|
| **ext4** | ~1.2B inodes | Linux servers, millions of small files | Slower with many small files |
| **XFS** | ~9B inodes | Large files, high performance | Less stable with fragmentation |
| **Btrfs** | Dynamic | Snapshots, checksums, compression | Still maturing, RAID complexity |
| **ZFS** | Dynamic | Reliability, deduplication, snapshots | High memory usage |
| **NTFS** | 2^32 entries | Windows systems | Slower on Linux |
| **S3/Cloud Storage** | Unlimited | Highly scalable, distributed | Latency, eventual consistency |

**Recommendations for inode planning:**
```bash
# Calculate inode usage
# Default ext4: 1 inode per ~16KB of space
# For 1M files: need ~16GB of inode space

# Check current inode usage
df -i

# Create filesystem with custom inode ratio for small files
# mkfs.ext4 -i 2048 /dev/sdX  # 1 inode per 2KB
```

---

## 2. Database Schema for File Metadata

### 2.1 PostgreSQL Schema (Recommended for Production)

**Advantages:**
- ACID transactions
- Full-text search with GIN indexes
- JSON support for flexible metadata
- Window functions for versioning
- Excellent performance with proper indexing

```sql
-- Core file metadata table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    parent_id UUID REFERENCES files(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash VARCHAR(64) NOT NULL,  -- SHA-256
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    storage_path VARCHAR(500) NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete

    -- Status
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    is_folder BOOLEAN NOT NULL DEFAULT FALSE,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Constraints
    CONSTRAINT parent_not_self CHECK (id != parent_id),
    CONSTRAINT name_not_empty CHECK (name != ''),
    CONSTRAINT size_non_negative CHECK (file_size >= 0)
);

-- Create indexes for common queries
CREATE INDEX idx_files_user_id ON files(user_id) WHERE NOT is_deleted;
CREATE INDEX idx_files_parent_id ON files(parent_id) WHERE NOT is_deleted;
CREATE INDEX idx_files_file_hash ON files(file_hash);
CREATE INDEX idx_files_created_at ON files(created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_files_file_path_trgm ON files USING GIN(file_path gin_trgm_ops);
CREATE INDEX idx_files_name_trgm ON files USING GIN(name gin_trgm_ops);
CREATE INDEX idx_files_tags ON files USING GIN(tags);
CREATE INDEX idx_files_metadata_jsonb ON files USING GIN(metadata);

-- File versions table
CREATE TABLE file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    change_description TEXT,

    metadata JSONB DEFAULT '{}',

    CONSTRAINT version_number_positive CHECK (version_number > 0),
    UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX idx_file_versions_created_at ON file_versions(created_at DESC);

-- Folder hierarchy closure table (for efficient ancestor queries)
CREATE TABLE folder_hierarchy (
    ancestor_id UUID NOT NULL,
    descendant_id UUID NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (ancestor_id, descendant_id),
    FOREIGN KEY (ancestor_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (descendant_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT depth_non_negative CHECK (depth >= 0)
);

CREATE INDEX idx_folder_hierarchy_descendant ON folder_hierarchy(descendant_id);

-- File permissions table
CREATE TABLE file_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    permission_level VARCHAR(50) NOT NULL,  -- 'view', 'edit', 'admin'

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_permission CHECK (
        permission_level IN ('view', 'edit', 'admin', 'none')
    ),
    UNIQUE(file_id, user_id)
);

CREATE INDEX idx_file_permissions_user_id ON file_permissions(user_id);
CREATE INDEX idx_file_permissions_file_id ON file_permissions(file_id);

-- File activity log (for audit trail)
CREATE TABLE file_activity_log (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID REFERENCES files(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete', 'view', 'share'
    details JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET
);

CREATE INDEX idx_file_activity_log_file_id ON file_activity_log(file_id);
CREATE INDEX idx_file_activity_log_user_id ON file_activity_log(user_id);
CREATE INDEX idx_file_activity_log_created_at ON file_activity_log(created_at DESC);

-- Duplicate detection table
CREATE TABLE file_duplicates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    duplicate_file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    file_hash VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,

    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT original_not_duplicate CHECK (original_file_id != duplicate_file_id),
    UNIQUE(original_file_id, duplicate_file_id)
);

CREATE INDEX idx_file_duplicates_hash ON file_duplicates(file_hash);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_file_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_files_updated_at
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION update_file_timestamp();

-- Trigger to maintain folder hierarchy
CREATE OR REPLACE FUNCTION maintain_folder_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_folder AND (OLD IS NULL OR NOT OLD.is_folder) THEN
        -- Insert self-reference
        INSERT INTO folder_hierarchy (ancestor_id, descendant_id, depth)
        VALUES (NEW.id, NEW.id, 0)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_folder_hierarchy
AFTER INSERT OR UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION maintain_folder_hierarchy();
```

**Query Examples:**

```sql
-- Get all files in a folder (efficient with indexes)
SELECT * FROM files
WHERE parent_id = $1 AND NOT is_deleted
ORDER BY is_folder DESC, name ASC;

-- Get full path to a file
WITH RECURSIVE path_builder AS (
    SELECT id, parent_id, name, 1 as depth
    FROM files WHERE id = $1

    UNION ALL

    SELECT f.id, f.parent_id, f.name, pb.depth + 1
    FROM files f
    JOIN path_builder pb ON f.id = pb.parent_id
    WHERE NOT f.is_deleted
)
SELECT string_agg(name, '/' ORDER BY depth DESC) as full_path
FROM path_builder;

-- Find all ancestors of a file using closure table
SELECT ancestor_id, depth FROM folder_hierarchy
WHERE descendant_id = $1
ORDER BY depth DESC;

-- Find duplicates
SELECT f1.id, f1.name, f2.id, f2.name
FROM files f1
JOIN files f2 ON f1.file_hash = f2.file_hash
WHERE f1.id != f2.id
AND NOT f1.is_deleted
AND NOT f2.is_deleted
AND f1.file_size = f2.file_size;
```

### 2.2 SQLite Schema (For Embedded/Smaller Systems)

```sql
-- SQLite doesn't support JSONB, use TEXT with JSON
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT REFERENCES files(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    storage_path TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    is_deleted INTEGER NOT NULL DEFAULT 0,
    is_folder INTEGER NOT NULL DEFAULT 0,

    metadata TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',

    CHECK (size >= 0),
    CHECK (name != '')
);

-- Optimize with indexes
CREATE INDEX idx_user_not_deleted ON files(user_id) WHERE is_deleted = 0;
CREATE INDEX idx_parent_not_deleted ON files(parent_id) WHERE is_deleted = 0;
CREATE INDEX idx_file_hash ON files(file_hash);
```

### 2.3 MongoDB Schema (For Flexible/Document-Based Systems)

```javascript
// Collections: files, file_versions, file_activity

// Files collection
db.createCollection("files", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["userId", "name", "fileHash", "fileSize", "storagePath"],
            properties: {
                _id: { bsonType: "objectId" },
                userId: {
                    bsonType: "objectId",
                    description: "Reference to user"
                },
                parentId: { bsonType: "objectId" },
                name: {
                    bsonType: "string",
                    maxLength: 255,
                    minLength: 1
                },
                filePath: {
                    bsonType: "string",
                    description: "Full path from root"
                },
                fileHash: {
                    bsonType: "string",
                    description: "SHA-256 hash"
                },
                fileSize: {
                    bsonType: "long",
                    minimum: 0
                },
                mimeType: { bsonType: "string" },
                storagePath: { bsonType: "string" },
                isFolder: { bsonType: "bool" },
                isDeleted: { bsonType: "bool" },
                deletedAt: { bsonType: "date" },
                createdAt: { bsonType: "date" },
                updatedAt: { bsonType: "date" },
                metadata: { bsonType: "object" },
                tags: {
                    bsonType: "array",
                    items: { bsonType: "string" }
                }
            }
        }
    }
});

// Create indexes
db.files.createIndex({ userId: 1, isDeleted: 1 });
db.files.createIndex({ parentId: 1, isDeleted: 1 });
db.files.createIndex({ fileHash: 1 });
db.files.createIndex({ createdAt: -1 });
db.files.createIndex({ "name": "text", "filePath": "text" });
db.files.createIndex({ tags: 1 });

// File versions collection
db.createCollection("file_versions");
db.file_versions.createIndex({ fileId: 1, versionNumber: 1 });
db.file_versions.createIndex({ fileHash: 1 });

// File activity collection
db.file_activity.createIndex({ fileId: 1, userId: 1 });
db.file_activity.createIndex({ createdAt: -1 });
```

---

## 3. Handling File Versions

### 3.1 Version Control Strategies

**Strategy A: Snapshot Versioning (Recommended)**

Each version stores complete file state:

```python
class VersionManager:
    """Manages file versioning with snapshots"""

    async def create_version(self, file_id: str, user_id: str,
                            file_path: str, description: str = None):
        """Create a new version snapshot"""
        # Compute hash of new file
        file_hash = compute_file_hash(file_path)
        file_size = os.path.getsize(file_path)

        # Get current version number
        current_version = await self.db.query("""
            SELECT COALESCE(MAX(version_number), 0) as max_version
            FROM file_versions
            WHERE file_id = $1
        """, (file_id,))

        next_version = current_version[0]['max_version'] + 1

        # Copy file to versioned storage
        storage_path = f"versions/{file_id}/v{next_version}/{file_hash}"
        os.makedirs(os.path.dirname(storage_path), exist_ok=True)
        shutil.copy2(file_path, storage_path)

        # Insert version record
        await self.db.execute("""
            INSERT INTO file_versions
            (file_id, version_number, file_hash, file_size, storage_path, created_by, change_description)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """, (file_id, next_version, file_hash, file_size, storage_path, user_id, description))

        # Update main file record
        await self.db.execute("""
            UPDATE files
            SET file_hash = $1, file_size = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        """, (file_hash, file_size, file_id))

        return next_version

    async def get_version(self, file_id: str, version_number: int) -> bytes:
        """Retrieve specific file version"""
        result = await self.db.query("""
            SELECT storage_path FROM file_versions
            WHERE file_id = $1 AND version_number = $2
        """, (file_id, version_number))

        if result:
            with open(result[0]['storage_path'], 'rb') as f:
                return f.read()
        return None

    async def list_versions(self, file_id: str):
        """List all versions of a file"""
        return await self.db.query("""
            SELECT version_number, file_hash, file_size, created_at,
                   created_by, change_description
            FROM file_versions
            WHERE file_id = $1
            ORDER BY version_number DESC
        """, (file_id,))
```

**Strategy B: Delta Versioning (For Storage Efficiency)**

Store only differences between versions:

```python
import difflib

class DeltaVersionManager:
    """Manages versions using delta compression"""

    async def create_delta_version(self, file_id: str, new_content: bytes,
                                  description: str = None):
        """Create version storing only deltas"""
        # Get previous version
        previous = await self.get_latest_version(file_id)

        if previous:
            # Compute delta
            old_lines = previous.split(b'\n')
            new_lines = new_content.split(b'\n')
            delta = difflib.unified_diff(old_lines, new_lines, lineterm=b'')
            delta_bytes = b'\n'.join(delta)

            storage_path = f"deltas/{file_id}/delta_v{version_number}.diff"
        else:
            # Store full version
            delta_bytes = new_content
            storage_path = f"versions/{file_id}/base_v1"

        # Store delta
        with open(storage_path, 'wb') as f:
            f.write(delta_bytes)

        # Record in database
        await self.db.execute("""
            INSERT INTO file_versions (file_id, version_number, storage_path, is_delta)
            VALUES ($1, $2, $3, true)
        """, (file_id, next_version, storage_path))

    async def reconstruct_version(self, file_id: str, version_number: int) -> bytes:
        """Reconstruct file from deltas"""
        versions = await self.db.query("""
            SELECT version_number, storage_path, is_delta
            FROM file_versions
            WHERE file_id = $1 AND version_number <= $2
            ORDER BY version_number ASC
        """, (file_id, version_number))

        content = b''
        for v in versions:
            with open(v['storage_path'], 'rb') as f:
                data = f.read()

            if v['is_delta']:
                content = self.apply_delta(content, data)
            else:
                content = data

        return content
```

### 3.2 Retention Policies

```sql
-- Delete old versions (keep last 10)
DELETE FROM file_versions
WHERE file_id = $1
AND version_number NOT IN (
    SELECT version_number FROM file_versions
    WHERE file_id = $1
    ORDER BY version_number DESC
    LIMIT 10
);

-- Delete versions older than 30 days
DELETE FROM file_versions
WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
AND file_id NOT IN (
    SELECT id FROM files WHERE is_deleted = false
);
```

---

## 4. Storage of Folder Hierarchy

### 4.1 Closure Table Pattern (Recommended for Complex Queries)

**Advantages:**
- Efficient ancestor/descendant queries
- Support for multiple paths
- Fast hierarchy traversal

**Implementation:**

```sql
-- Insert folder hierarchy automatically with trigger
CREATE OR REPLACE FUNCTION insert_folder_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_folder THEN
        -- Insert self-reference
        INSERT INTO folder_hierarchy (ancestor_id, descendant_id, depth)
        VALUES (NEW.id, NEW.id, 0);

        -- Insert parent references
        INSERT INTO folder_hierarchy (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, NEW.id, depth + 1
        FROM folder_hierarchy
        WHERE descendant_id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Query: Get all files in folder (including subfolders)
SELECT f.* FROM files f
JOIN folder_hierarchy fh ON f.id = fh.descendant_id
WHERE fh.ancestor_id = $1
AND f.is_deleted = false;

-- Query: Get breadcrumb path
SELECT f.name, f.id FROM files f
JOIN folder_hierarchy fh ON f.id = fh.ancestor_id
WHERE fh.descendant_id = $1
ORDER BY fh.depth DESC;
```

### 4.2 Materialized Path Pattern (Good for PostgreSQL)

```sql
-- Store full path as ltree type (PostgreSQL only)
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE files_ltree (
    id UUID PRIMARY KEY,
    path ltree NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    is_folder BOOLEAN NOT NULL,
    ...
);

CREATE INDEX ON files_ltree USING GIST (path);

-- Query: Get all descendants
SELECT * FROM files_ltree
WHERE path <@ $1;  -- path is descendant of or equal to $1

-- Query: Get breadcrumb
SELECT * FROM files_ltree
WHERE path @> $1;  -- path is ancestor of or equal to $1
```

### 4.3 Recursive CTE Pattern (Works Everywhere)

```python
async def get_folder_tree(parent_id: str, depth: int = -1):
    """Get folder tree using recursive CTE"""

    query = """
    WITH RECURSIVE folder_tree AS (
        -- Base case: start folder
        SELECT id, parent_id, name, 1 as depth, ARRAY[name] as path
        FROM files
        WHERE id = $1 AND is_deleted = false

        UNION ALL

        -- Recursive case: child folders
        SELECT f.id, f.parent_id, f.name, ft.depth + 1,
               ft.path || f.name
        FROM files f
        JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.is_deleted = false
        AND (($2 = -1) OR (ft.depth < $2))
    )
    SELECT * FROM folder_tree
    ORDER BY path;
    """

    return await self.db.query(query, (parent_id, depth))
```

---

## 5. UUID vs Sequential IDs

### 5.1 Comparison Table

| Aspect | UUID | Sequential ID |
|--------|------|---------------|
| **Uniqueness** | Guaranteed globally | Local to table |
| **Collision Risk** | ~0 (128-bit) | Predictable/Sequential |
| **Database Size** | 16 bytes | 4-8 bytes |
| **Index Performance** | Slower (random inserts) | Faster (monotonic) |
| **Privacy** | Better (non-guessable) | Weak (guessable IDs) |
| **Horizontal Scaling** | Excellent | Requires coordination |
| **API Usage** | Safe in URLs | Risky (enumeration attacks) |
| **Debugging** | Harder to remember | Easier to debug |
| **Migration** | Excellent | Risky across systems |

### 5.2 Hybrid Approach (Recommended)

```python
class FileIdentifier:
    """Hybrid approach: use UUID internally, friendly ID externally"""

    def __init__(self):
        self.counter = 0

    async def create_file(self, user_id: str, filename: str):
        # UUID for database
        file_uuid = str(uuid.uuid4())

        # Friendly ID for API: <user_id>_<timestamp>_<counter>
        timestamp = int(time.time() * 1000)  # milliseconds
        friendly_id = f"{user_id}_{timestamp}_{self.counter}"
        self.counter += 1

        # Store both
        await self.db.execute("""
            INSERT INTO files (id, friendly_id, ...)
            VALUES ($1, $2, ...)
        """, (file_uuid, friendly_id))

        return file_uuid, friendly_id
```

### 5.3 Practical Recommendations

**Use UUID if:**
- System will scale horizontally
- Files shared across services
- Need strong privacy guarantees
- Distributed database (NoSQL)

**Use Sequential if:**
- Single server, simple scaling
- Need optimal database performance
- Human readability important
- Legacy system constraints

**Use Hybrid if:**
- Want best of both worlds
- Public API with internal DB
- Medium to large scale

```python
# Implementation example
import uuid
import hashlib

class FileID:
    """Production-ready file ID generator"""

    # Internal: UUID
    @staticmethod
    def generate_internal_id() -> str:
        return str(uuid.uuid4())

    # External: Short ID (24 chars)
    @staticmethod
    def generate_short_id(user_id: str, timestamp: int) -> str:
        """Generate URL-safe short ID"""
        import base64
        import os
        random_bytes = os.urandom(12)
        short = base64.urlsafe_b64encode(random_bytes).decode().rstrip('=')
        return short[:12]

    # URL slug: user-friendly
    @staticmethod
    def generate_slug(filename: str, file_id: str) -> str:
        """Generate URL slug"""
        slug = filename.replace(' ', '-').lower()
        slug = ''.join(c for c in slug if c.isalnum() or c == '-')
        # Add hash suffix to ensure uniqueness
        hash_suffix = hashlib.sha256(file_id.encode()).hexdigest()[:8]
        return f"{slug}-{hash_suffix}"
```

---

## 6. Soft Delete vs Hard Delete

### 6.1 Soft Delete Strategy (Recommended for Production)

**Advantages:**
- Data recovery possible
- Maintain referential integrity
- Audit trails preserved
- Can correlate with activity logs
- Meet compliance requirements (GDPR right to be forgotten with audit)

**Implementation:**

```sql
-- Soft delete: set deleted_at timestamp
UPDATE files SET
    deleted_at = CURRENT_TIMESTAMP,
    is_deleted = TRUE
WHERE id = $1;

-- Restore from soft delete
UPDATE files SET
    deleted_at = NULL,
    is_deleted = FALSE
WHERE id = $1
AND deleted_at IS NOT NULL;

-- Exclude soft-deleted from queries
SELECT * FROM files
WHERE is_deleted = FALSE;

-- Purge old soft-deleted files (after retention period)
DELETE FROM files
WHERE is_deleted = TRUE
AND deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
```

**Python implementation:**

```python
class FileManager:
    """File manager with soft delete support"""

    async def soft_delete(self, file_id: str, user_id: str, reason: str = None):
        """Soft delete a file"""
        async with self.db.transaction():
            # Mark as deleted
            await self.db.execute("""
                UPDATE files
                SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
                WHERE id = $1
            """, (file_id,))

            # Log activity
            await self.db.execute("""
                INSERT INTO file_activity_log (file_id, user_id, action, details)
                VALUES ($1, $2, 'soft_delete', $3::jsonb)
            """, (file_id, user_id, json.dumps({"reason": reason})))

    async def restore(self, file_id: str, user_id: str):
        """Restore soft-deleted file"""
        async with self.db.transaction():
            await self.db.execute("""
                UPDATE files
                SET is_deleted = FALSE, deleted_at = NULL
                WHERE id = $1
            """, (file_id,))

            await self.db.execute("""
                INSERT INTO file_activity_log (file_id, user_id, action)
                VALUES ($1, $2, 'restore')
            """, (file_id, user_id))

    async def purge_deleted_files(self, days: int = 90):
        """Permanently delete files after retention period"""
        # Get files to purge
        deleted_files = await self.db.query("""
            SELECT id, storage_path FROM files
            WHERE is_deleted = TRUE
            AND deleted_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
        """, (days,))

        for file in deleted_files:
            # Remove from filesystem
            if os.path.exists(file['storage_path']):
                os.remove(file['storage_path'])

            # Hard delete from database
            await self.db.execute("DELETE FROM files WHERE id = $1", (file['id'],))

    async def list_deleted_files(self, user_id: str, limit: int = 100):
        """List deleted files for user (like trash)"""
        return await self.db.query("""
            SELECT id, name, deleted_at, file_size
            FROM files
            WHERE user_id = $1 AND is_deleted = TRUE
            ORDER BY deleted_at DESC
            LIMIT $2
        """, (user_id, limit))
```

### 6.2 Hard Delete Strategy

**Use only when:**
- Privacy critical (GDPR compliance)
- Regulatory requirement (HIPAA, financial data)
- Sensitive data (passwords, tokens)
- Space constraints critical

```python
async def hard_delete(self, file_id: str, user_id: str, password_hash: str = None):
    """Permanently delete file - irreversible"""

    # Require additional verification for sensitive operations
    if not await self.verify_user_password(user_id, password_hash):
        raise PermissionError("Additional verification required")

    async with self.db.transaction():
        # Get file details
        file_record = await self.db.query_one("""
            SELECT storage_path, file_hash FROM files WHERE id = $1
        """, (file_id,))

        # Secure deletion: overwrite file multiple times
        await self.secure_delete_file(file_record['storage_path'])

        # Remove all versions
        versions = await self.db.query("""
            SELECT storage_path FROM file_versions WHERE file_id = $1
        """, (file_id,))

        for version in versions:
            await self.secure_delete_file(version['storage_path'])

        # Delete database records
        await self.db.execute("""
            DELETE FROM file_versions WHERE file_id = $1
        """, (file_id,))

        await self.db.execute("""
            DELETE FROM files WHERE id = $1
        """, (file_id,))

        # Log with metadata only (no file contents)
        await self.db.execute("""
            INSERT INTO deletion_audit_log (file_id, file_hash, deleted_by, deleted_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        """, (file_id, file_record['file_hash'], user_id))

async def secure_delete_file(self, filepath: str):
    """Securely delete file by overwriting"""
    if not os.path.exists(filepath):
        return

    file_size = os.path.getsize(filepath)

    # DoD 5220.22-M standard: 3 passes
    with open(filepath, 'ba+') as f:
        f.seek(0)
        f.write(os.urandom(file_size))  # Random data

        f.seek(0)
        f.write(b'\x00' * file_size)  # Zeros

        f.seek(0)
        f.write(b'\xFF' * file_size)  # Ones

    os.remove(filepath)
```

---

## 7. Handling Duplicate Files

### 7.1 Duplicate Detection Strategy

**Method A: Hash-Based Detection (Recommended)**

```python
class DuplicateDetector:
    """Detect and manage duplicate files"""

    async def detect_duplicates(self, user_id: str = None):
        """Find all duplicate files"""
        query = """
        SELECT file_hash, COUNT(*) as count,
               array_agg(id) as file_ids,
               array_agg(file_size) as sizes,
               SUM(file_size) * (COUNT(*) - 1) as space_wasted
        FROM files
        WHERE is_deleted = FALSE
        AND ($1::UUID IS NULL OR user_id = $1)
        GROUP BY file_hash
        HAVING COUNT(*) > 1
        ORDER BY space_wasted DESC
        """

        return await self.db.query(query, (user_id,))

    async def get_duplicate_info(self, file_hash: str):
        """Get information about duplicate set"""
        return await self.db.query("""
            SELECT id, name, user_id, file_size, created_at, updated_at
            FROM files
            WHERE file_hash = $1 AND is_deleted = FALSE
            ORDER BY created_at ASC
        """, (file_hash,))
```

**Method B: Content-Addressable Storage (Automatic Deduplication)**

```python
class CASStoarge:
    """Content-addressable storage for automatic deduplication"""

    async def store_file(self, user_id: str, filename: str, file_content: bytes):
        """Store file with automatic deduplication"""
        # Compute hash
        file_hash = hashlib.sha256(file_content).hexdigest()
        file_size = len(file_content)

        # Check if file already exists
        existing = await self.db.query_one("""
            SELECT id FROM files
            WHERE file_hash = $1 AND is_deleted = FALSE
        """, (file_hash,))

        if existing:
            # File already stored, create reference
            file_id = str(uuid.uuid4())
            await self.db.execute("""
                INSERT INTO files (id, user_id, name, file_hash, file_size,
                                 storage_path, original_file_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, (file_id, user_id, filename, file_hash, file_size,
                  f"cas/{file_hash}", existing['id']))

            return file_id

        # New file - store in CAS
        file_id = str(uuid.uuid4())
        storage_path = f"cas/{file_hash}"

        os.makedirs(os.path.dirname(storage_path), exist_ok=True)
        with open(storage_path, 'wb') as f:
            f.write(file_content)

        # Record in database
        await self.db.execute("""
            INSERT INTO files (id, user_id, name, file_hash, file_size, storage_path)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, (file_id, user_id, filename, file_hash, file_size, storage_path))

        return file_id
```

### 7.2 Duplicate Management Strategies

**Strategy 1: Deduplication at Rest**

```python
async def deduplicate_user_files(self, user_id: str):
    """Deduplicate files for a user"""

    duplicates = await self.detect_duplicates(user_id)

    for dup_set in duplicates:
        file_ids = dup_set['file_ids']
        file_hash = dup_set['file_hash']

        # Keep oldest as original
        original_id = (await self.db.query_one("""
            SELECT id FROM files WHERE id = ANY($1)
            ORDER BY created_at ASC LIMIT 1
        """, (file_ids,)))['id']

        # Consolidate others to point to original
        for file_id in file_ids:
            if file_id != original_id:
                await self.db.execute("""
                    UPDATE files
                    SET original_file_id = $1
                    WHERE id = $2
                """, (original_id, file_id))
```

**Strategy 2: Linked Files (Multiple Names, Single Storage)**

```python
async def link_duplicate(self, original_file_id: str, duplicate_file_id: str):
    """Link duplicate to original to save space"""

    original = await self.db.query_one(
        "SELECT storage_path FROM files WHERE id = $1",
        (original_file_id,)
    )

    async with self.db.transaction():
        # Remove physical duplicate
        dup_file = await self.db.query_one(
            "SELECT storage_path FROM files WHERE id = $1",
            (duplicate_file_id,)
        )
        os.remove(dup_file['storage_path'])

        # Update to reference original storage
        await self.db.execute("""
            UPDATE files
            SET storage_path = $1, is_linked = TRUE, linked_to = $2
            WHERE id = $3
        """, (original['storage_path'], original_file_id, duplicate_file_id))
```

### 7.3 Database Schema for Duplicates

```sql
-- Track duplicate relationships
CREATE TABLE file_deduplication (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_file_id UUID NOT NULL REFERENCES files(id),
    duplicate_file_id UUID NOT NULL REFERENCES files(id),
    file_hash VARCHAR(64) NOT NULL,
    space_saved BIGINT NOT NULL,

    deduplicated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT original_not_dup CHECK (original_file_id != duplicate_file_id),
    UNIQUE(original_file_id, duplicate_file_id)
);

CREATE INDEX idx_dedup_original ON file_deduplication(original_file_id);
CREATE INDEX idx_dedup_hash ON file_deduplication(file_hash);
```

---

## 8. Indexing Strategies for Fast Search

### 8.1 PostgreSQL Indexing Strategy (Recommended)

```sql
-- 1. B-tree indexes for equality and range queries
CREATE INDEX idx_files_user_created ON files(user_id, created_at DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_files_parent_created ON files(parent_id, created_at DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_files_size ON files(file_size)
    WHERE is_deleted = FALSE;

-- 2. Hash index for exact file hash lookup (fast)
CREATE INDEX idx_files_hash_hash ON files USING HASH(file_hash);

-- 3. GIN index for full-text search on filename
CREATE INDEX idx_files_name_gin ON files
    USING GIN (to_tsvector('english', name))
    WHERE is_deleted = FALSE;

-- 4. GIST index for full path text search with trigrams
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_files_path_trgm ON files
    USING GIN (file_path gin_trgm_ops)
    WHERE is_deleted = FALSE;

-- 5. GIST index for JSONB metadata
CREATE INDEX idx_files_metadata_gin ON files
    USING GIN(metadata)
    WHERE is_deleted = FALSE;

-- 6. GIN index for tags array
CREATE INDEX idx_files_tags_gin ON files
    USING GIN(tags)
    WHERE is_deleted = FALSE;

-- 7. Partial index for frequently accessed state
CREATE INDEX idx_files_recent_active ON files(user_id, created_at DESC)
    WHERE is_deleted = FALSE
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';

-- 8. Multi-column index for common queries
CREATE INDEX idx_files_user_parent_name ON files(user_id, parent_id, name)
    WHERE is_deleted = FALSE;
```

### 8.2 Full-Text Search Implementation

```python
class FileSearch:
    """Full-text search for files"""

    async def search_files(self, user_id: str, query: str, limit: int = 50):
        """Search files by name and content"""

        sql = """
        SELECT id, name, file_size, created_at,
               ts_rank(search_vector, query) as rank
        FROM files,
             plainto_tsquery('english', $2) as query
        WHERE user_id = $1
        AND is_deleted = FALSE
        AND search_vector @@ query
        ORDER BY rank DESC, created_at DESC
        LIMIT $3
        """

        return await self.db.query(sql, (user_id, query, limit))

    async def search_with_filters(self, user_id: str, **filters):
        """Advanced search with multiple filters"""

        conditions = ["user_id = $1", "is_deleted = FALSE"]
        params = [user_id]
        param_count = 2

        # Search query
        if 'q' in filters:
            conditions.append(f"search_vector @@ plainto_tsquery($${param_count})")
            params.append(filters['q'])
            param_count += 1

        # File type
        if 'mime_type' in filters:
            conditions.append(f"mime_type LIKE $${param_count}")
            params.append(f"{filters['mime_type']}%")
            param_count += 1

        # Date range
        if 'created_after' in filters:
            conditions.append(f"created_at > $${param_count}::timestamp")
            params.append(filters['created_after'])
            param_count += 1

        if 'created_before' in filters:
            conditions.append(f"created_at < $${param_count}::timestamp")
            params.append(filters['created_before'])
            param_count += 1

        # Size range
        if 'min_size' in filters:
            conditions.append(f"file_size >= $${param_count}")
            params.append(filters['min_size'])
            param_count += 1

        if 'max_size' in filters:
            conditions.append(f"file_size <= $${param_count}")
            params.append(filters['max_size'])
            param_count += 1

        # Tags
        if 'tags' in filters:
            conditions.append(f"tags && $${param_count}")
            params.append(filters['tags'])
            param_count += 1

        sql = f"""
        SELECT id, name, file_size, created_at, mime_type
        FROM files
        WHERE {' AND '.join(conditions)}
        ORDER BY created_at DESC
        LIMIT 100
        """

        return await self.db.query(sql, params)
```

### 8.3 Elasticsearch Integration (For Large Scale)

```python
from elasticsearch import Elasticsearch

class ElasticsearchIndexer:
    """Index files in Elasticsearch for high-performance search"""

    def __init__(self, hosts=['localhost:9200']):
        self.es = Elasticsearch(hosts)

    async def index_file(self, file_data: dict):
        """Index file in Elasticsearch"""
        doc = {
            'file_id': file_data['id'],
            'user_id': file_data['user_id'],
            'name': file_data['name'],
            'file_path': file_data['file_path'],
            'mime_type': file_data['mime_type'],
            'file_size': file_data['file_size'],
            'created_at': file_data['created_at'],
            'tags': file_data.get('tags', []),
            'metadata': file_data.get('metadata', {}),
        }

        self.es.index(index='files', id=file_data['id'], document=doc)

    def search(self, user_id: str, query: str, filters: dict = None):
        """Search files"""
        search_body = {
            'query': {
                'bool': {
                    'must': [
                        {'match': {'user_id': user_id}},
                        {'multi_match': {
                            'query': query,
                            'fields': ['name^3', 'file_path', 'tags']
                        }}
                    ],
                    'filter': []
                }
            }
        }

        # Add filters
        if filters:
            if 'mime_type' in filters:
                search_body['query']['bool']['filter'].append(
                    {'term': {'mime_type': filters['mime_type']}}
                )
            if 'min_size' in filters:
                search_body['query']['bool']['filter'].append(
                    {'range': {'file_size': {'gte': filters['min_size']}}}
                )
            if 'max_size' in filters:
                search_body['query']['bool']['filter'].append(
                    {'range': {'file_size': {'lte': filters['max_size']}}}
                )

        return self.es.search(index='files', body=search_body)
```

### 8.4 Indexing Best Practices

```python
class IndexOptimizer:
    """Analyze and optimize index performance"""

    async def analyze_query_performance(self):
        """Analyze query plans"""

        # Expensive queries to monitor
        slow_queries = [
            # Query 1: Search across all files
            """
            EXPLAIN ANALYZE
            SELECT * FROM files
            WHERE name ILIKE '%document%'
            AND is_deleted = FALSE
            """,

            # Query 2: Deep folder recursion
            """
            EXPLAIN ANALYZE
            WITH RECURSIVE folder_tree AS (...)
            SELECT * FROM folder_tree
            """,

            # Query 3: Large file versions
            """
            EXPLAIN ANALYZE
            SELECT * FROM file_versions
            WHERE file_id = $1
            ORDER BY created_at DESC
            """
        ]

        for query in slow_queries:
            result = await self.db.query(query)
            print(result)  # Review execution plan

    async def suggest_indexes(self):
        """Suggest missing indexes based on statistics"""

        # PostgreSQL: Find unused indexes
        unused = await self.db.query("""
            SELECT schemaname, tablename, indexname
            FROM pg_indexes
            WHERE schemaname != 'pg_catalog'
            AND indexname NOT IN (
                SELECT indexname FROM pg_stat_user_indexes
                WHERE idx_scan = 0
            )
        """)

        return unused
```

---

## Production-Ready System Recommendations

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client Applications                    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              REST API / GraphQL Server                    │
│  - FastAPI, Django, Node.js, Go, etc.                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼──────────┐    ┌────────▼───────────┐
│  PostgreSQL      │    │  Elasticsearch     │
│  (Metadata)      │    │  (Search Index)    │
└───────┬──────────┘    └────────────────────┘
        │
┌───────▼──────────────────────────────────────┐
│     Local Filesystem / S3 / Cloud Storage     │
│  - Sharded directory structure                │
│  - Content-addressable storage                │
│  - Automatic deduplication                    │
└──────────────────────────────────────────────┘
```

### Recommended Tech Stack

**Tier 1 (< 1 Million Files)**
- PostgreSQL for all metadata and versioning
- Local filesystem or S3 for file storage
- Basic B-tree indexes only
- File activity logging to database

**Tier 2 (1-100 Million Files)**
- PostgreSQL with optimized indexes and partitioning
- Elasticsearch for full-text search
- S3/Cloud storage for file storage
- Dedicated activity log table with aggregation jobs
- Redis cache for frequently accessed metadata

**Tier 3 (> 100 Million Files)**
- PostgreSQL with sharding
- Elasticsearch cluster with multiple nodes
- MinIO/S3 compatible object storage
- Distributed cache (Redis Cluster)
- Separate event streaming (Kafka) for activity logs
- File processing workers for indexing

### Configuration Examples

**PostgreSQL Performance Tuning for Files**

```sql
-- For large datasets, enable parallelism
ALTER DATABASE files_db SET max_parallel_workers = 4;
ALTER DATABASE files_db SET max_parallel_workers_per_gather = 2;

-- Configure work memory for sorts/joins
SET work_mem = '256MB';

-- Enable JIT compilation for complex queries
ALTER DATABASE files_db SET jit = on;
ALTER DATABASE files_db SET jit_above_cost = 100000;

-- Connection pooling
-- Use pgBouncer with 100-500 connections per server

-- Autovacuum for metadata tables
ALTER TABLE files SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE files SET (autovacuum_analyze_scale_factor = 0.005);
```

**S3 Configuration for Files**

```python
import boto3
from botocore.client import Config

# High-throughput configuration
s3_client = boto3.client('s3',
    config=Config(
        max_pool_connections=50,
        retries={'max_attempts': 3, 'mode': 'adaptive'},
        tcp_keepalive=True,
        connect_timeout=5,
        read_timeout=60,
    )
)

# Use multipart upload for large files
def upload_large_file(bucket: str, key: str, filepath: str):
    """Upload with multipart for performance"""
    file_size = os.path.getsize(filepath)
    chunk_size = 100 * 1024 * 1024  # 100MB chunks

    config = TransferConfig(
        multipart_threshold=chunk_size,
        max_concurrency=4,
        multipart_chunksize=chunk_size
    )

    transfer = S3Transfer(s3_client, config=config)
    transfer.upload_file(filepath, bucket, key)
```

### Security Considerations

```python
class FileSecurityManager:
    """Security best practices"""

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Remove dangerous characters from filename"""
        import re
        # Remove path traversal attempts
        filename = filename.replace('..', '')
        filename = filename.replace('/', '')
        filename = filename.replace('\\', '')
        # Remove control characters
        filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
        return filename

    @staticmethod
    def validate_file_extension(filename: str, allowed: list) -> bool:
        """Validate file extension against whitelist"""
        _, ext = os.path.splitext(filename.lower())
        return ext.lstrip('.') in allowed

    @staticmethod
    def scan_file_content(filepath: str) -> dict:
        """Scan file for malware (integrate with ClamAV, VirusTotal)"""
        # Check file magic bytes
        magic = magic.from_file(filepath, mime=True)

        # Validate against expected MIME type
        # Scan with antivirus if needed
        return {'safe': True, 'mime_type': magic}
```

### Monitoring & Observability

```python
from prometheus_client import Counter, Histogram, Gauge

# Metrics
file_upload_duration = Histogram('file_upload_seconds', 'File upload duration')
file_download_duration = Histogram('file_download_seconds', 'File download duration')
search_duration = Histogram('search_seconds', 'Search query duration')

file_count_gauge = Gauge('files_total', 'Total files in system')
storage_bytes_gauge = Gauge('storage_bytes_total', 'Total storage used')

failed_uploads = Counter('upload_failures', 'Failed uploads')
deleted_files = Counter('files_deleted', 'Deleted files')

# Usage
@file_upload_duration.time()
async def upload_file(file_data: bytes):
    # ... upload logic ...
    pass

# Monitor database performance
async def log_query_metrics(query: str, duration: float):
    if duration > 1.0:  # Log slow queries
        logger.warning(f"Slow query ({duration}s): {query}")
```

---

## Summary & Key Takeaways

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| **Storage Organization** | Content-addressable with sharding | Scales to billions of files, automatic deduplication |
| **Database** | PostgreSQL with rich indexes | ACID, full-text search, JSON support |
| **IDs** | UUID internal, friendly IDs external | Scalability + API usability |
| **Deletions** | Soft delete with 90-day retention | Recovery, compliance, audit trails |
| **Versioning** | Snapshot model with retention policy | Simplicity, integrity |
| **Hierarchy** | Closure table or recursive CTEs | Efficient queries for deep paths |
| **Duplicates** | CAS-based auto-dedup with hash detection | Saves 20-40% storage, transparent |
| **Search** | PostgreSQL GIN + Elasticsearch | Fast metadata searches + full-text |

**For production, start with PostgreSQL + local/S3 storage, scale to Elasticsearch + sharding as needed.**
