# File Storage System - Architecture Patterns & Best Practices

---

## Pattern 1: Content-Addressable Storage (CAS)

### Overview
Files are stored based on their content hash rather than filename, enabling automatic deduplication.

### Architecture
```
User uploads "document.pdf"
              ↓
       Compute SHA-256
              ↓
    abc123def456... (hash)
              ↓
    Shard into: ab/c123def456.../data
              ↓
Filesystem or S3 storage
              ↓
Database records reference
     the hash, not path
```

### Advantages
- **Deduplication**: Identical files stored once
- **Integrity**: Hash verification prevents corruption
- **Scalability**: Flat structure prevents inode limits
- **Cleanup**: Easy garbage collection

### Implementation

```python
class CASStorage:
    """Content-Addressable Storage"""

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)

    def compute_hash(self, content: bytes) -> str:
        """Compute content hash"""
        return hashlib.sha256(content).hexdigest()

    def get_path(self, content_hash: str) -> Path:
        """Convert hash to storage path with sharding"""
        # 2-level sharding: ab/cdef1234.../data
        return self.base_path / content_hash[:2] / content_hash[2:6] / content_hash[6:]

    async def store(self, content: bytes) -> str:
        """Store content, return hash"""
        content_hash = self.compute_hash(content)
        path = self.get_path(content_hash)

        # Skip if already exists
        if path.exists():
            return content_hash

        # Create and store
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

        # Set immutable (optional, prevents accidental modification)
        os.chmod(path, 0o444)

        return content_hash

    async def retrieve(self, content_hash: str) -> bytes:
        """Retrieve content by hash"""
        path = self.get_path(content_hash)
        if not path.exists():
            raise FileNotFoundError(f"Content hash not found: {content_hash}")
        return path.read_bytes()

    async def verify_integrity(self, content_hash: str) -> bool:
        """Verify file integrity"""
        try:
            content = await self.retrieve(content_hash)
            computed = self.compute_hash(content)
            return computed == content_hash
        except:
            return False

    async def gc_unused_objects(self, db, age_days: int = 30):
        """Garbage collect unused content objects"""
        cutoff_date = datetime.utcnow() - timedelta(days=age_days)

        # Find unused hashes
        unused = await db.query("""
            SELECT DISTINCT storage_path
            FROM storage.files
            WHERE updated_at < $1
            AND file_hash NOT IN (
                SELECT DISTINCT file_hash FROM storage.files
                WHERE is_deleted = FALSE
            )
        """, (cutoff_date,))

        for item in unused:
            try:
                Path(item['storage_path']).unlink()
            except:
                pass  # Already deleted

# Usage
cas = CASStorage('/var/storage/objects')

# Upload
content = b'file content'
file_hash = await cas.store(content)
await db.execute(
    "INSERT INTO files (file_hash) VALUES ($1)", (file_hash,)
)

# Download
content = await cas.retrieve(file_hash)
```

### When to Use CAS
- Large number of users (duplicate files inevitable)
- Significant storage costs
- Need integrity verification
- Want transparent deduplication

### When NOT to Use CAS
- Performance-critical path
- Small dataset (no dedup benefit)
- Need file modification in-place
- Compliance requires file isolation

---

## Pattern 2: Hierarchical Storage with Lazy Loading

### Overview
Implement folder hierarchies efficiently using recursive queries and lazy loading.

### Architecture
```
Root Folder
    ├── Project A/
    │   ├── Phase 1/
    │   │   ├── Document 1.pdf
    │   │   └── Document 2.pdf
    │   └── Phase 2/
    │       └── Presentation.pptx
    └── Archive/
        └── Old Files/
            └── backup.zip
```

### Database Schema

```sql
CREATE TABLE folders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    parent_id UUID REFERENCES folders(id),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(parent_id, name)
);

CREATE TABLE folder_hierarchy (
    ancestor_id UUID NOT NULL REFERENCES folders(id),
    descendant_id UUID NOT NULL REFERENCES folders(id),
    depth INT NOT NULL,

    PRIMARY KEY (ancestor_id, descendant_id)
);

-- Insert trigger to maintain closure table
CREATE OR REPLACE FUNCTION maintain_closure_table()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert self reference
    INSERT INTO folder_hierarchy (ancestor_id, descendant_id, depth)
    VALUES (NEW.id, NEW.id, 0);

    -- Insert ancestors of parent
    INSERT INTO folder_hierarchy (ancestor_id, descendant_id, depth)
    SELECT ancestor_id, NEW.id, depth + 1
    FROM folder_hierarchy
    WHERE descendant_id = NEW.parent_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER folder_created
AFTER INSERT ON folders
FOR EACH ROW EXECUTE FUNCTION maintain_closure_table();
```

### Lazy Loading Implementation

```python
class FolderService:
    """Lazy-loaded folder hierarchy"""

    async def get_folder_breadcrumb(self, folder_id: UUID) -> List[Dict]:
        """Get path from root to folder (for breadcrumb UI)"""
        # Efficient: only fetches ancestors
        result = await db.query("""
            SELECT f.id, f.name
            FROM folders f
            JOIN folder_hierarchy fh ON f.id = fh.ancestor_id
            WHERE fh.descendant_id = $1
            ORDER BY fh.depth DESC
        """, (folder_id,))
        return result

    async def get_folder_children_paginated(
        self,
        folder_id: UUID,
        page: int = 1,
        page_size: int = 50
    ) -> Dict:
        """Lazy load children with pagination"""
        offset = (page - 1) * page_size

        # Get children
        children = await db.query("""
            SELECT id, name, is_folder, file_size, created_at
            FROM files
            WHERE parent_id = $1
            AND user_id = (SELECT user_id FROM files WHERE id = $1 LIMIT 1)
            ORDER BY is_folder DESC, name ASC
            LIMIT $2 OFFSET $3
        """, (folder_id, page_size, offset))

        # Count total
        count = await db.query_one("""
            SELECT COUNT(*) as total
            FROM files
            WHERE parent_id = $1
        """, (folder_id,))

        return {
            'items': children,
            'total': count['total'],
            'page': page,
            'page_size': page_size,
            'has_more': count['total'] > offset + page_size
        }

    async def get_folder_tree(
        self,
        folder_id: UUID,
        max_depth: int = 3,
        expanded_ids: List[UUID] = None
    ) -> Dict:
        """Get partial tree (only expanded folders)"""
        expanded = expanded_ids or []

        result = await db.query("""
            WITH RECURSIVE tree AS (
                -- Root
                SELECT id, parent_id, name, 1 as depth, ARRAY[id] as path
                FROM files
                WHERE id = $1 AND is_folder = TRUE

                UNION ALL

                -- Children (only if parent was expanded)
                SELECT f.id, f.parent_id, f.name, t.depth + 1,
                       t.path || f.id
                FROM files f
                JOIN tree t ON f.parent_id = t.id
                WHERE f.user_id = (SELECT user_id FROM files WHERE id = $1)
                AND f.is_folder = TRUE
                AND (f.parent_id = ANY($2::UUID[]) OR t.depth = 1)
                AND t.depth < $3
            )
            SELECT id, parent_id, name, depth
            FROM tree
        """, (folder_id, expanded, max_depth))

        return self._build_tree_structure(result)

    def _build_tree_structure(self, flat_rows):
        """Convert flat rows to tree structure"""
        tree_map = {}
        for row in flat_rows:
            tree_map[row['id']] = {
                'id': row['id'],
                'name': row['name'],
                'parent_id': row['parent_id'],
                'children': []
            }

        # Build parent-child relationships
        for row in flat_rows:
            if row['parent_id'] and row['parent_id'] in tree_map:
                tree_map[row['parent_id']]['children'].append(
                    tree_map[row['id']]
                )

        return tree_map[flat_rows[0]['id']] if flat_rows else {}
```

### Frontend (React) with Lazy Loading

```javascript
function FileExplorer({ rootFolderId }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [folderContents, setFolderContents] = useState({});

  const toggleFolder = async (folderId) => {
    const newExpanded = new Set(expandedFolders);

    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
      // Lazy load contents
      const contents = await fetch(
        `/api/folders/${folderId}?expand=true`
      ).then(r => r.json());
      setFolderContents(prev => ({
        ...prev,
        [folderId]: contents
      }));
    }

    setExpandedFolders(newExpanded);
  };

  return (
    <FolderTree
      folderId={rootFolderId}
      expanded={expandedFolders}
      onToggle={toggleFolder}
      contents={folderContents}
    />
  );
}
```

---

## Pattern 3: Eventual Consistency with Async Indexing

### Overview
For large systems, decouple file storage from search indexing using async workers.

### Architecture
```
Upload Request → API → Save to PostgreSQL + S3
                          ↓
                    Send Event to Kafka
                          ↓
                    ┌─────────────────┐
                    │ Indexing Worker │
                    │ (Elasticsearch) │
                    └─────────────────┘
                          ↓
                   Index Updated (eventual)
```

### Implementation

```python
# kafka_producer.py
from kafka import KafkaProducer
import json

class FileEventProducer:
    """Publish file events to message queue"""

    def __init__(self, bootstrap_servers: List[str]):
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            acks='all',  # Wait for all replicas
            retries=3
        )

    async def file_uploaded(self, file_id: UUID, user_id: UUID,
                           filename: str, file_size: int):
        """Notify file uploaded"""
        self.producer.send('file-events', {
            'event_type': 'file_uploaded',
            'file_id': str(file_id),
            'user_id': str(user_id),
            'filename': filename,
            'file_size': file_size,
            'timestamp': datetime.utcnow().isoformat()
        })

    async def file_deleted(self, file_id: UUID):
        """Notify file deleted"""
        self.producer.send('file-events', {
            'event_type': 'file_deleted',
            'file_id': str(file_id),
            'timestamp': datetime.utcnow().isoformat()
        })

# kafka_consumer.py
from kafka import KafkaConsumer

class FileIndexWorker:
    """Consume file events and index them"""

    def __init__(self, elasticsearch_client, bootstrap_servers: List[str]):
        self.es = elasticsearch_client
        self.consumer = KafkaConsumer(
            'file-events',
            bootstrap_servers=bootstrap_servers,
            group_id='indexing-group',
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='earliest',
            enable_auto_commit=False
        )

    async def run(self):
        """Main worker loop"""
        for message in self.consumer:
            event = message.value
            try:
                if event['event_type'] == 'file_uploaded':
                    await self.index_file(event)
                elif event['event_type'] == 'file_deleted':
                    await self.delete_index(event)

                # Only commit after successful processing
                self.consumer.commit()
            except Exception as e:
                logger.error(f"Failed to process event: {e}")
                # Retry is handled by Kafka offset management

    async def index_file(self, event):
        """Index file in Elasticsearch"""
        self.es.index(
            index='files',
            id=event['file_id'],
            body={
                'user_id': event['user_id'],
                'filename': event['filename'],
                'file_size': event['file_size'],
                'indexed_at': datetime.utcnow(),
                'filename_suggest': {
                    'input': event['filename'].split(),
                    'weight': 10
                }
            }
        )

    async def delete_index(self, event):
        """Remove file from search index"""
        self.es.delete(index='files', id=event['file_id'])
```

### Benefits
- **Decoupled**: File upload doesn't wait for indexing
- **Resilient**: Indexing failures don't block uploads
- **Scalable**: Can add more workers independently
- **Monitorable**: Each component has clear responsibility

---

## Pattern 4: Tiered Caching Strategy

### Overview
Optimize performance with multi-layer caching.

```
┌─────────────────────────────┐
│  Layer 1: Browser Cache     │ (Static files, ETags)
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Layer 2: CDN Cache         │ (CloudFront, Cloudflare)
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Layer 3: Redis Cache       │ (Metadata, search results)
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Layer 4: Database Cache    │ (PostgreSQL shared_buffers)
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Layer 5: Storage           │ (S3, Local FS)
└─────────────────────────────┘
```

### Implementation

```python
from functools import wraps
import hashlib
import time

class CacheManager:
    """Multi-layer cache management"""

    def __init__(self, redis_client):
        self.redis = redis_client

    def cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key"""
        key_parts = [prefix] + [str(a) for a in args]
        key_str = ':'.join(key_parts)
        return key_str

    def cached(self, ttl: int = 3600, namespace: str = 'default'):
        """Decorator for caching function results"""
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                # Generate cache key
                key = self.cache_key(
                    f"{namespace}:{func.__name__}",
                    *args,
                    **{k: v for k, v in kwargs.items() if k != 'cache_buster'}
                )

                # Try cache
                cached_value = self.redis.get(key)
                if cached_value:
                    return json.loads(cached_value)

                # Call function
                result = await func(*args, **kwargs)

                # Store in cache
                self.redis.setex(
                    key,
                    ttl,
                    json.dumps(result, default=str)
                )

                return result

            return wrapper
        return decorator

    async def invalidate_user_cache(self, user_id: UUID):
        """Invalidate all cache for user"""
        pattern = f"*:user:{user_id}:*"
        keys = self.redis.keys(pattern)
        if keys:
            self.redis.delete(*keys)

# Usage
cache = CacheManager(redis_client)

@cache.cached(ttl=3600, namespace='files')
async def get_file_metadata(file_id: UUID, user_id: UUID):
    return await db.query_one(
        "SELECT * FROM files WHERE id = $1 AND user_id = $2",
        (file_id, user_id)
    )

# Invalidate after update
await db.execute("UPDATE files SET name = $1 WHERE id = $2", (new_name, file_id))
await cache.invalidate_user_cache(user_id)
```

### Cache Invalidation Strategies

```python
class SmartCacheInvalidation:
    """Intelligent cache invalidation"""

    async def on_file_updated(self, file_id: UUID, user_id: UUID, changes: Dict):
        """Invalidate relevant caches on file update"""
        # Get file info
        file = await db.query_one(
            "SELECT parent_id FROM files WHERE id = $1",
            (file_id,)
        )

        # Invalidate specific caches
        cache_keys = [
            f"files:get_file_metadata:{file_id}:{user_id}",
            f"folders:list_folder_contents:{file['parent_id']}:{user_id}",
            f"search:recent_files:{user_id}",
        ]

        for key in cache_keys:
            self.redis.delete(key)

        # Invalidate search index
        if 'name' in changes:
            await self.update_search_index(file_id, file['name'])

    async def on_file_deleted(self, file_id: UUID, user_id: UUID):
        """Invalidate caches on deletion"""
        file = await db.query_one(
            "SELECT parent_id FROM files WHERE id = $1",
            (file_id,)
        )

        # Invalidate parent folder listing
        pattern = f"folders:list_folder_contents:{file['parent_id']}:*"
        keys = self.redis.keys(pattern)
        if keys:
            self.redis.delete(*keys)

        # Remove from search index
        await self.remove_from_search_index(file_id)
```

---

## Pattern 5: Audit & Compliance Logging

### Overview
Maintain comprehensive audit trail for compliance and forensics.

```python
class AuditLogger:
    """Comprehensive audit logging"""

    async def log_file_operation(
        self,
        operation: str,
        file_id: UUID,
        user_id: UUID,
        details: Dict = None,
        ip_address: str = None,
        user_agent: str = None
    ):
        """Log file operation for audit"""
        await self.db.execute("""
            INSERT INTO audit_log
            (operation, file_id, user_id, details, ip_address, user_agent, timestamp)
            VALUES ($1, $2, $3, $4::jsonb, $5::inet, $6, CURRENT_TIMESTAMP)
        """, (
            operation,
            file_id,
            user_id,
            json.dumps(details or {}),
            ip_address,
            user_agent
        ))

    async def get_audit_trail(
        self,
        file_id: UUID,
        start_date: datetime = None,
        end_date: datetime = None
    ):
        """Get complete audit trail for file"""
        sql = """
        SELECT operation, user_id, details, timestamp, ip_address
        FROM audit_log
        WHERE file_id = $1
        """
        params = [file_id]

        if start_date:
            sql += " AND timestamp >= $2::timestamp"
            params.append(start_date)

        if end_date:
            sql += f" AND timestamp <= ${len(params)+1}::timestamp"
            params.append(end_date)

        sql += " ORDER BY timestamp DESC"

        return await self.db.query(sql, *params)

    async def get_user_activity(
        self,
        user_id: UUID,
        days: int = 30
    ):
        """Get user activity summary"""
        return await self.db.query("""
        SELECT
            DATE(timestamp) as date,
            operation,
            COUNT(*) as count
        FROM audit_log
        WHERE user_id = $1
        AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 day' * $2
        GROUP BY DATE(timestamp), operation
        ORDER BY date DESC
        """, (user_id, days))

    async def check_compliance(self, file_id: UUID) -> Dict:
        """Generate compliance report"""
        trail = await self.get_audit_trail(file_id)

        return {
            'file_id': file_id,
            'total_operations': len(trail),
            'first_created': trail[-1]['timestamp'] if trail else None,
            'last_modified': trail[0]['timestamp'] if trail else None,
            'operations': [t['operation'] for t in trail],
            'unique_users': len(set(t['user_id'] for t in trail)),
            'ip_addresses': list(set(t['ip_address'] for t in trail if t['ip_address']))
        }
```

---

## Best Practices Checklist

### Data Integrity
- [ ] Always hash file contents for verification
- [ ] Use checksums for network transfers
- [ ] Implement ACID transactions for metadata
- [ ] Maintain audit logs of all changes
- [ ] Verify backups regularly

### Performance
- [ ] Use connection pooling for database
- [ ] Implement multi-level caching strategy
- [ ] Monitor query performance (EXPLAIN ANALYZE)
- [ ] Profile slow operations regularly
- [ ] Use CDN for file downloads

### Security
- [ ] Sanitize filenames (remove path traversal)
- [ ] Validate file extensions against whitelist
- [ ] Scan uploads for malware
- [ ] Use encryption at rest and in transit
- [ ] Implement rate limiting on uploads
- [ ] Secure S3 buckets with policies

### Scalability
- [ ] Design for horizontal scaling from day 1
- [ ] Use sharding strategy if > 100M files
- [ ] Implement async indexing/processing
- [ ] Monitor storage growth patterns
- [ ] Plan for 10x growth

### Operations
- [ ] Set up monitoring alerts
- [ ] Implement proper logging
- [ ] Regular backup testing
- [ ] Document runbooks for common issues
- [ ] Plan for disaster recovery
- [ ] Schedule maintenance windows

### Compliance
- [ ] Implement soft delete for GDPR
- [ ] Maintain audit trails
- [ ] Implement data retention policies
- [ ] Allow user data export
- [ ] Support right-to-deletion requests

---

## Summary

These patterns provide battle-tested solutions for:
1. **CAS**: Efficient storage and deduplication
2. **Hierarchical Storage**: User-friendly folder navigation
3. **Eventual Consistency**: Scalable async processing
4. **Tiered Caching**: Optimal performance
5. **Audit Logging**: Compliance and forensics

Combine these patterns based on your specific requirements and scale.
