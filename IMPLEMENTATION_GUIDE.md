# File Storage System - Implementation Guide

## Quick Start Implementation

This guide provides ready-to-use code for building a production filesystem application.

---

## 1. Database Setup Script

### PostgreSQL Initialization

```sql
-- Initialize database
CREATE DATABASE filesystem_db;
\c filesystem_db

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Create schema
CREATE SCHEMA IF NOT EXISTS storage;

-- Users table (reference)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    storage_quota BIGINT NOT NULL DEFAULT 5368709120,  -- 5GB
    storage_used BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main files table
CREATE TABLE storage.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES storage.files(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_hash VARCHAR(64),  -- SHA-256, NULL for folders
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100),

    storage_path VARCHAR(500),
    is_folder BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    created_by UUID,
    updated_by UUID,

    CONSTRAINT parent_not_self CHECK (id != parent_id),
    CONSTRAINT name_not_empty CHECK (name != ''),
    CONSTRAINT size_non_negative CHECK (file_size >= 0),
    UNIQUE(parent_id, name) WHERE NOT is_deleted
);

-- Indexes
CREATE INDEX idx_files_user_id ON storage.files(user_id) WHERE NOT is_deleted;
CREATE INDEX idx_files_parent_id ON storage.files(parent_id) WHERE NOT is_deleted;
CREATE INDEX idx_files_hash ON storage.files(file_hash) WHERE NOT is_deleted;
CREATE INDEX idx_files_created_at ON storage.files(created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_files_name_trgm ON storage.files USING GIN(name gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX idx_files_path_trgm ON storage.files USING GIN(file_path gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX idx_files_tags ON storage.files USING GIN(tags);

-- File versions
CREATE TABLE storage.file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES storage.files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    change_description TEXT,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT version_positive CHECK (version_number > 0),
    UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file_id ON storage.file_versions(file_id);
CREATE INDEX idx_file_versions_created_at ON storage.file_versions(created_at DESC);

-- Activity log
CREATE TABLE storage.file_activity_log (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID REFERENCES storage.files(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET
);

CREATE INDEX idx_activity_file_id ON storage.file_activity_log(file_id);
CREATE INDEX idx_activity_user_id ON storage.file_activity_log(user_id);
CREATE INDEX idx_activity_created_at ON storage.file_activity_log(created_at DESC);

-- Trash/deleted files
CREATE TABLE storage.trash (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_by UUID,
    original_size BIGINT NOT NULL,

    CONSTRAINT days_30_retention CHECK (deleted_at > CURRENT_TIMESTAMP - INTERVAL '90 days')
);

CREATE INDEX idx_trash_user_id ON storage.trash(user_id);
CREATE INDEX idx_trash_deleted_at ON storage.trash(deleted_at DESC);

-- Triggers
CREATE OR REPLACE FUNCTION storage.update_files_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_files_updated_at
BEFORE UPDATE ON storage.files
FOR EACH ROW
EXECUTE FUNCTION storage.update_files_timestamp();

-- Update storage quota
CREATE OR REPLACE FUNCTION storage.update_user_storage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET storage_used = storage_used + NEW.file_size
        WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET storage_used = storage_used - OLD.file_size
        WHERE id = OLD.user_id AND storage_used >= OLD.file_size;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_storage_usage
AFTER INSERT OR DELETE ON storage.files
FOR EACH ROW
WHEN (NOT NEW.is_deleted OR OLD.is_deleted)
EXECUTE FUNCTION storage.update_user_storage();
```

---

## 2. Python Implementation (FastAPI + PostgreSQL)

### Models

```python
# models.py
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
import json

class FileMetadata(BaseModel):
    description: Optional[str] = None
    tags: List[str] = []
    custom_data: dict = {}

class FileResponse(BaseModel):
    id: UUID
    name: str
    file_path: str
    is_folder: bool
    file_size: int
    mime_type: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID]
    metadata: dict

class FolderContents(BaseModel):
    files: List[FileResponse]
    folder_count: int
    file_count: int
    total_size: int

class FileUploadRequest(BaseModel):
    name: str
    description: Optional[str] = None
    tags: List[str] = []

class FileVersionInfo(BaseModel):
    version_number: int
    file_size: int
    created_at: datetime
    change_description: Optional[str]
    created_by: UUID
```

### Database Manager

```python
# database.py
import asyncpg
from typing import List, Dict, Any, Optional
import logging
from uuid import UUID

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            self.connection_string,
            min_size=10,
            max_size=20,
            command_timeout=60,
        )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def query(self, sql: str, *args) -> List[Dict]:
        """Execute SELECT query"""
        async with self.pool.acquire() as conn:
            return await conn.fetch(sql, *args)

    async def query_one(self, sql: str, *args) -> Optional[Dict]:
        """Execute SELECT query, return first row"""
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(sql, *args)

    async def execute(self, sql: str, *args) -> str:
        """Execute INSERT/UPDATE/DELETE"""
        async with self.pool.acquire() as conn:
            return await conn.execute(sql, *args)

    async def transaction(self):
        """Context manager for transactions"""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                return conn

class FileQuotaManager:
    def __init__(self, db: DatabaseManager):
        self.db = db

    async def check_quota(self, user_id: UUID, file_size: int) -> bool:
        """Check if user can upload file"""
        result = await self.db.query_one(
            """
            SELECT storage_quota, storage_used
            FROM users WHERE id = $1
            """,
            user_id
        )

        if not result:
            return False

        return result['storage_used'] + file_size <= result['storage_quota']

    async def get_user_storage(self, user_id: UUID) -> Dict[str, int]:
        """Get user storage info"""
        result = await self.db.query_one(
            """
            SELECT storage_quota, storage_used,
                   (storage_quota - storage_used) as available
            FROM users WHERE id = $1
            """,
            user_id
        )
        return dict(result) if result else None
```

### File Service

```python
# file_service.py
import hashlib
import os
import shutil
from pathlib import Path
from uuid import UUID, uuid4
from datetime import datetime
import asyncio
from typing import Optional, BinaryIO

class FileStorageService:
    def __init__(self, base_storage_path: str, db: DatabaseManager):
        self.base_path = Path(base_storage_path)
        self.db = db
        self.base_path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_hash(filepath: str, algorithm: str = 'sha256') -> str:
        """Compute file hash"""
        hash_obj = hashlib.new(algorithm)
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()

    def get_storage_path(self, file_hash: str) -> Path:
        """Get sharded storage path from hash"""
        # Use first 4 characters for sharding (256^2 subdirs)
        shard1 = file_hash[:2]
        shard2 = file_hash[2:4]
        return self.base_path / shard1 / shard2 / file_hash[4:]

    async def upload_file(
        self,
        user_id: UUID,
        parent_id: Optional[UUID],
        filename: str,
        file_content: bytes,
        user_agent: Optional[str] = None
    ) -> UUID:
        """Upload file to storage"""

        # Check quota
        quota_ok = await FileQuotaManager(self.db).check_quota(
            user_id, len(file_content)
        )
        if not quota_ok:
            raise ValueError("Storage quota exceeded")

        # Compute hash
        file_hash = hashlib.sha256(file_content).hexdigest()
        file_size = len(file_content)

        # Check if file already exists (deduplication)
        existing = await self.db.query_one(
            """
            SELECT id FROM storage.files
            WHERE file_hash = $1 AND user_id = $2 AND NOT is_deleted
            """,
            file_hash, user_id
        )

        if existing:
            # Link to existing file
            file_id = uuid4()
            await self.db.execute(
                """
                INSERT INTO storage.files
                (id, user_id, parent_id, name, file_hash, file_size,
                 storage_path, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                file_id, user_id, parent_id, filename, file_hash,
                file_size, str(self.get_storage_path(file_hash)), user_id
            )
        else:
            # New file
            file_id = uuid4()
            storage_path = self.get_storage_path(file_hash)

            # Create directories and save file
            storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(storage_path, 'wb') as f:
                f.write(file_content)

            # Insert into database
            await self.db.execute(
                """
                INSERT INTO storage.files
                (id, user_id, parent_id, name, file_hash, file_size,
                 storage_path, created_by, mime_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                file_id, user_id, parent_id, filename, file_hash,
                file_size, str(storage_path), user_id,
                self._guess_mime_type(filename)
            )

        # Log activity
        await self.db.execute(
            """
            INSERT INTO storage.file_activity_log
            (file_id, user_id, action, details)
            VALUES ($1, $2, $3, $4::jsonb)
            """,
            file_id, user_id, 'upload',
            json.dumps({'filename': filename, 'size': file_size})
        )

        return file_id

    async def download_file(self, file_id: UUID, user_id: UUID) -> bytes:
        """Download file"""

        # Get file info
        file_info = await self.db.query_one(
            """
            SELECT storage_path, name FROM storage.files
            WHERE id = $1 AND user_id = $2 AND NOT is_deleted
            """,
            file_id, user_id
        )

        if not file_info:
            raise FileNotFoundError("File not found")

        # Log access
        await self.db.execute(
            """
            INSERT INTO storage.file_activity_log
            (file_id, user_id, action) VALUES ($1, $2, $3)
            """,
            file_id, user_id, 'download'
        )

        # Read and return file
        with open(file_info['storage_path'], 'rb') as f:
            return f.read()

    async def soft_delete(self, file_id: UUID, user_id: UUID):
        """Soft delete file"""

        file_info = await self.db.query_one(
            """
            SELECT name, file_size FROM storage.files
            WHERE id = $1 AND user_id = $2
            """,
            file_id, user_id
        )

        if not file_info:
            raise FileNotFoundError("File not found")

        async with self.db.pool.acquire() as conn:
            async with conn.transaction():
                # Mark as deleted
                await conn.execute(
                    """
                    UPDATE storage.files
                    SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    """,
                    file_id
                )

                # Add to trash
                await conn.execute(
                    """
                    INSERT INTO storage.trash
                    (file_id, user_id, file_name, deleted_by, original_size)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    file_id, user_id, file_info['name'],
                    user_id, file_info['file_size']
                )

                # Log
                await conn.execute(
                    """
                    INSERT INTO storage.file_activity_log
                    (file_id, user_id, action) VALUES ($1, $2, $3)
                    """,
                    file_id, user_id, 'delete'
                )

    async def restore_file(self, file_id: UUID, user_id: UUID):
        """Restore from trash"""

        async with self.db.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    UPDATE storage.files
                    SET is_deleted = FALSE, deleted_at = NULL
                    WHERE id = $1 AND user_id = $2
                    """,
                    file_id, user_id
                )

                await conn.execute(
                    """
                    DELETE FROM storage.trash WHERE file_id = $1
                    """,
                    file_id
                )

    async def get_trash(self, user_id: UUID, limit: int = 50):
        """Get user's trash"""
        return await self.db.query(
            """
            SELECT file_id as id, file_name as name, deleted_at, original_size
            FROM storage.trash
            WHERE user_id = $1
            ORDER BY deleted_at DESC
            LIMIT $2
            """,
            user_id, limit
        )

    async def purge_trash(self, user_id: UUID, days: int = 30):
        """Permanently delete old trash"""

        trash_files = await self.db.query(
            """
            SELECT file_id, original_size FROM storage.trash
            WHERE user_id = $1
            AND deleted_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * $2
            """,
            user_id, days
        )

        for trash in trash_files:
            await self.db.execute(
                """
                DELETE FROM storage.files WHERE id = $1
                """,
                trash['file_id']
            )

    @staticmethod
    def _guess_mime_type(filename: str) -> str:
        """Guess MIME type from filename"""
        import mimetypes
        mime, _ = mimetypes.guess_type(filename)
        return mime or 'application/octet-stream'

class FolderService:
    def __init__(self, db: DatabaseManager):
        self.db = db

    async def create_folder(
        self,
        user_id: UUID,
        parent_id: Optional[UUID],
        folder_name: str
    ) -> UUID:
        """Create a folder"""

        folder_id = uuid4()

        await self.db.execute(
            """
            INSERT INTO storage.files
            (id, user_id, parent_id, name, is_folder, created_by)
            VALUES ($1, $2, $3, $4, TRUE, $5)
            """,
            folder_id, user_id, parent_id, folder_name, user_id
        )

        return folder_id

    async def list_folder_contents(
        self,
        user_id: UUID,
        folder_id: Optional[UUID] = None,
        sort_by: str = 'name',
        order: str = 'ASC'
    ):
        """List folder contents"""

        valid_sorts = ['name', 'created_at', 'file_size', 'updated_at']
        if sort_by not in valid_sorts:
            sort_by = 'name'

        order = 'DESC' if order.upper() == 'DESC' else 'ASC'

        sql = f"""
        SELECT id, name, is_folder, file_size, mime_type,
               created_at, updated_at, created_by
        FROM storage.files
        WHERE user_id = $1
        AND parent_id {'=' if folder_id else 'IS'} {'$2' if folder_id else 'NULL'}
        AND NOT is_deleted
        ORDER BY is_folder DESC, {sort_by} {order}
        """

        params = [user_id]
        if folder_id:
            params.append(folder_id)

        return await self.db.query(sql, *params)

    async def get_folder_tree(
        self,
        user_id: UUID,
        folder_id: Optional[UUID] = None,
        max_depth: int = 5
    ):
        """Get folder hierarchy"""

        sql = """
        WITH RECURSIVE folder_tree AS (
            SELECT id, parent_id, name, 1 as depth, ARRAY[name] as path
            FROM storage.files
            WHERE user_id = $1
            AND (($2::UUID IS NULL AND parent_id IS NULL) OR id = $2)
            AND is_folder = TRUE
            AND NOT is_deleted

            UNION ALL

            SELECT f.id, f.parent_id, f.name, ft.depth + 1,
                   ft.path || f.name
            FROM storage.files f
            JOIN folder_tree ft ON f.parent_id = ft.id
            WHERE f.user_id = $1
            AND f.is_folder = TRUE
            AND NOT f.is_deleted
            AND ft.depth < $3
        )
        SELECT id, parent_id, name, depth, path
        FROM folder_tree
        ORDER BY path
        """

        return await self.db.query(sql, user_id, folder_id, max_depth)
```

### Search Service

```python
# search_service.py
from typing import List, Dict, Optional
from uuid import UUID

class FileSearchService:
    def __init__(self, db: DatabaseManager):
        self.db = db

    async def search_by_name(
        self,
        user_id: UUID,
        query: str,
        limit: int = 50
    ) -> List[Dict]:
        """Search files by name"""

        sql = """
        SELECT id, name, file_path, file_size, created_at, is_folder
        FROM storage.files
        WHERE user_id = $1
        AND NOT is_deleted
        AND name ILIKE $2
        ORDER BY created_at DESC
        LIMIT $3
        """

        return await self.db.query(sql, user_id, f"%{query}%", limit)

    async def search_by_filters(
        self,
        user_id: UUID,
        **filters
    ) -> List[Dict]:
        """Advanced search with multiple filters"""

        conditions = ["user_id = $1", "NOT is_deleted"]
        params = [user_id]
        param_count = 2

        # Name/path search
        if 'q' in filters:
            conditions.append(f"(name ILIKE ${param_count} OR file_path ILIKE ${param_count})")
            params.append(f"%{filters['q']}%")
            param_count += 1

        # File type
        if 'mime_type' in filters:
            conditions.append(f"mime_type LIKE ${param_count}")
            params.append(f"{filters['mime_type']}%")
            param_count += 1

        # Date range
        if 'created_after' in filters:
            conditions.append(f"created_at >= ${param_count}::timestamp")
            params.append(filters['created_after'])
            param_count += 1

        if 'created_before' in filters:
            conditions.append(f"created_at <= ${param_count}::timestamp")
            params.append(filters['created_before'])
            param_count += 1

        # Size range
        if 'min_size' in filters:
            conditions.append(f"file_size >= ${param_count}")
            params.append(filters['min_size'])
            param_count += 1

        if 'max_size' in filters:
            conditions.append(f"file_size <= ${param_count}")
            params.append(filters['max_size'])
            param_count += 1

        # Tags
        if 'tags' in filters:
            conditions.append(f"tags && ${param_count}::text[]")
            params.append(filters['tags'])
            param_count += 1

        # Folder filter
        if 'is_folder' in filters:
            conditions.append(f"is_folder = ${param_count}")
            params.append(filters['is_folder'])
            param_count += 1

        sql = f"""
        SELECT id, name, file_path, file_size, mime_type, is_folder,
               created_at, updated_at
        FROM storage.files
        WHERE {' AND '.join(conditions)}
        ORDER BY created_at DESC
        LIMIT 100
        """

        return await self.db.query(sql, *params)

    async def get_duplicates(
        self,
        user_id: Optional[UUID] = None
    ) -> List[Dict]:
        """Find duplicate files"""

        sql = """
        SELECT file_hash, COUNT(*) as count,
               array_agg(id) as file_ids,
               array_agg(name) as names,
               SUM(file_size) * (COUNT(*) - 1) as space_wasted
        FROM storage.files
        WHERE NOT is_deleted
        AND ($1::UUID IS NULL OR user_id = $1)
        AND file_hash IS NOT NULL
        GROUP BY file_hash
        HAVING COUNT(*) > 1
        ORDER BY space_wasted DESC
        """

        return await self.db.query(sql, user_id)
```

### FastAPI Routes

```python
# api.py
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse
from uuid import UUID
import asyncio

app = FastAPI(title="File Storage API")
db = DatabaseManager("postgresql://user:pass@localhost/filesystem_db")
file_service = FileStorageService("/var/storage", db)
folder_service = FolderService(db)
search_service = FileSearchService(db)

@app.on_event("startup")
async def startup():
    await db.connect()

@app.on_event("shutdown")
async def shutdown():
    await db.disconnect()

# Routes
@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    parent_id: Optional[UUID] = None,
    user_id: UUID = Depends(get_current_user)
):
    """Upload a file"""
    content = await file.read()
    file_id = await file_service.upload_file(
        user_id, parent_id, file.filename, content
    )
    return {"file_id": file_id}

@app.get("/api/files/{file_id}/download")
async def download_file(
    file_id: UUID,
    user_id: UUID = Depends(get_current_user)
):
    """Download a file"""
    content = await file_service.download_file(file_id, user_id)
    return StreamingResponse(
        iter([content]),
        media_type='application/octet-stream'
    )

@app.delete("/api/files/{file_id}")
async def delete_file(
    file_id: UUID,
    user_id: UUID = Depends(get_current_user)
):
    """Delete a file (soft delete)"""
    await file_service.soft_delete(file_id, user_id)
    return {"status": "deleted"}

@app.post("/api/folders")
async def create_folder(
    name: str,
    parent_id: Optional[UUID] = None,
    user_id: UUID = Depends(get_current_user)
):
    """Create a folder"""
    folder_id = await folder_service.create_folder(user_id, parent_id, name)
    return {"folder_id": folder_id}

@app.get("/api/folders/{folder_id}")
async def list_folder(
    folder_id: Optional[UUID] = None,
    sort_by: str = "name",
    user_id: UUID = Depends(get_current_user)
):
    """List folder contents"""
    contents = await folder_service.list_folder_contents(
        user_id, folder_id, sort_by
    )
    return {"contents": contents}

@app.get("/api/search")
async def search(
    q: str,
    user_id: UUID = Depends(get_current_user),
    **filters
):
    """Search files"""
    results = await search_service.search_by_filters(user_id, q=q, **filters)
    return {"results": results}

@app.get("/api/duplicates")
async def find_duplicates(
    user_id: UUID = Depends(get_current_user)
):
    """Find duplicate files"""
    duplicates = await search_service.get_duplicates(user_id)
    return {"duplicates": duplicates}
```

---

## 3. Performance Tuning Checklist

### Database Optimization

```bash
# Enable query analysis
ANALYZE database_name;

# Vacuum and reindex (maintenance)
VACUUM ANALYZE storage.files;
REINDEX TABLE storage.files;

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

# Find missing indexes
SELECT * FROM pg_stat_user_tables
WHERE seq_scan > 1000 AND seq_scan > idx_scan;
```

### Connection Pooling

```python
# pgBouncer configuration
[databases]
filesystem_db = host=localhost port=5432 dbname=filesystem_db

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
```

### Caching Strategy

```python
# Redis cache for frequently accessed data
import redis
from functools import wraps
import json

cache = redis.Redis(host='localhost', port=6379, decode_responses=True)

def cached(ttl: int = 3600):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{args}:{kwargs}"
            result = cache.get(key)
            if result:
                return json.loads(result)

            result = await func(*args, **kwargs)
            cache.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

@cached(ttl=3600)
async def get_file_metadata(file_id: UUID):
    return await db.query_one(
        "SELECT * FROM storage.files WHERE id = $1",
        file_id
    )
```

---

## 4. Monitoring & Alerting

### Prometheus Metrics

```python
from prometheus_client import Counter, Histogram, Gauge

# Counters
uploads_total = Counter('uploads_total', 'Total uploads')
downloads_total = Counter('downloads_total', 'Total downloads')
deletes_total = Counter('deletes_total', 'Total deletions')
errors_total = Counter('errors_total', 'Total errors', ['error_type'])

# Histograms
upload_duration = Histogram('upload_duration_seconds', 'Upload duration')
download_duration = Histogram('download_duration_seconds', 'Download duration')
search_duration = Histogram('search_duration_seconds', 'Search duration')

# Gauges
storage_used_bytes = Gauge('storage_used_bytes', 'Storage used')
files_total = Gauge('files_total', 'Total files')

# Usage
@upload_duration.time()
async def upload_file(...):
    ...
```

---

## Summary

This implementation provides:
- PostgreSQL schema with full-text search
- File storage with content-addressed deduplication
- Soft delete with trash recovery
- Folder hierarchy management
- Advanced search filtering
- Performance monitoring

Scale up by:
1. Adding Elasticsearch for larger datasets
2. Moving to S3/object storage
3. Implementing caching layers
4. Database sharding for horizontal scaling
