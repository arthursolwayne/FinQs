# File Storage System - Scale Decision Matrix

This document helps you choose the right architecture based on your system's scale and requirements.

---

## System Scale Categories

### Tier 1: Small Scale (< 100K Files, < 10 Users)

**Use Cases:** Personal file storage, small team collaboration, document management

**Recommended Architecture:**
```
┌─────────────────┐
│  FastAPI/Flask  │
└────────┬────────┘
         │
    ┌────┴─────┐
    │           │
┌───▼──┐    ┌──▼────┐
│SQLite│    │Local FS│
└──────┘    └────────┘
```

**Technology Choices:**

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database | SQLite | Simplicity, minimal setup, ACID compliance |
| Storage | Local Filesystem | Sufficient for < 50GB total |
| Search | SQLite LIKE/GLOB | Simple pattern matching |
| Versioning | Database snapshots | Keep last 5-10 versions |
| IDs | Integer (auto_increment) | Efficient, sufficient |
| Deletion | Soft delete | Simple recovery mechanism |
| Replication | Manual backup | Daily/weekly backups |

**SQLite Schema (Simplified):**

```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    parent_id INTEGER REFERENCES files(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT,
    file_size INTEGER NOT NULL,
    is_folder INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    UNIQUE(parent_id, name) WHERE is_deleted = 0
);

CREATE INDEX idx_user_id ON files(user_id) WHERE is_deleted = 0;
CREATE INDEX idx_parent_id ON files(parent_id) WHERE is_deleted = 0;
CREATE INDEX idx_file_hash ON files(file_hash);
```

**Python Implementation:**

```python
import sqlite3
from pathlib import Path

class TinyFileStorage:
    def __init__(self, db_path: str, storage_path: str):
        self.db_path = db_path
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")  # Better concurrency
            # ... create tables ...

    def upload_file(self, user_id: int, filename: str, content: bytes):
        file_hash = hashlib.sha256(content).hexdigest()

        # Save file
        file_path = self.storage_path / file_hash[:2] / file_hash
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)

        # Record in DB
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO files (user_id, name, file_hash, file_size, file_path)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, filename, file_hash, len(content), str(file_path)))
            conn.commit()
```

**Expected Performance:**
- Upload: < 1 second
- Download: < 1 second
- List directory: < 100ms
- Search: < 500ms

---

### Tier 2: Medium Scale (100K - 100M Files, 10-1000 Users)

**Use Cases:** Small SaaS product, growing team storage, document repository

**Recommended Architecture:**
```
┌────────────────────────┐
│    FastAPI Server(s)   │
└────────┬───────────────┘
         │
    ┌────┴──────────┐
    │               │
┌───▼──────┐   ┌───▼────┐
│PostgreSQL│   │S3/MinIO │
└──────────┘   └─────────┘
```

**Technology Choices:**

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database | PostgreSQL + Connection Pool | ACID, full-text search, JSON support |
| Storage | S3 / MinIO | Scalable, durable, cheap |
| Search | PostgreSQL GIST + GIN | Full-text, trigram, array indexes |
| Versioning | Snapshot model, keep last 10 | Balance between features and cost |
| IDs | UUID + friendly IDs | Scalability + UX |
| Deletion | Soft delete (30-90 days) | Compliance, recovery |
| Replication | Database backups + S3 versioning | Point-in-time recovery |
| Cache | Redis | Metadata caching |

**PostgreSQL Tuning:**

```sql
-- Memory settings (for 4GB system)
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 64MB
maintenance_work_mem = 256MB

-- Checkpoint settings
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9

-- Connection pooling
max_connections = 200
```

**Deployment Diagram:**

```
Load Balancer (nginx/HAProxy)
    │
    ├── App Server 1 (FastAPI)
    ├── App Server 2 (FastAPI)
    └── App Server 3 (FastAPI)
            │
    ┌───────┴─────────┐
    │                 │
PostgreSQL Cluster  S3/MinIO Cluster
(Primary + Replica) (Multi-node)
    │
    └── Backup Storage (daily)
```

**Performance Targets:**
- Upload: 1-2 seconds (including S3)
- Download: 500ms - 1 second
- List directory: 50-200ms
- Search: 100-500ms
- Concurrent users: 100-500

**Cost Estimation (AWS):**
- RDS PostgreSQL: $100-300/month
- S3 Storage: $23 per TB/month
- S3 Requests: ~$0.0004 per 10K requests
- Data Transfer: $0.02/GB out

**Example: 50M files (100TB total)**
- Storage: 100TB × $23 = $2,300/month
- Requests: 1B read requests = ~$40/month
- Database: $300/month
- **Total: ~$2,640/month**

---

### Tier 3: Large Scale (100M - 1B+ Files, 1000+ Users)

**Use Cases:** Enterprise storage (Dropbox-scale), cloud storage service, content delivery

**Recommended Architecture:**
```
┌──────────────────────────────┐
│  Distributed API Layer       │
│  (Load Balanced)             │
└────────┬─────────────────────┘
         │
    ┌────┴──────────────────┬─────────────┐
    │                       │             │
┌───▼──────────┐  ┌────────▼─────┐  ┌──▼──────┐
│PostgreSQL    │  │Elasticsearch  │  │S3 Fleet │
│Cluster       │  │Cluster        │  │(Multi   │
│(Sharded)     │  │(Distributed)  │  │-region) │
└──────────────┘  └───────────────┘  └─────────┘
    │
┌───▼──────────────┐
│Redis Cluster     │
│(Distributed)     │
└──────────────────┘
    │
    └── Message Queue (Kafka)
        - Indexing pipeline
        - Activity logs
        - Notifications
```

**Technology Choices:**

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database | PostgreSQL Sharded | Horizontal scaling, consistent hashing |
| Full-text Search | Elasticsearch | Distributed, fast search at scale |
| Storage | S3 Multi-region | High availability, geo-replication |
| Versioning | Delta compression | Space efficiency |
| IDs | UUID (distributed) | No coordination overhead |
| Deletion | Soft delete + event-based purge | Async cleanup |
| Replication | Multi-region S3, DB replication | Disaster recovery |
| Cache | Redis Cluster | Distributed cache |
| Events | Kafka | Async indexing, audit trail |

**Database Sharding Strategy:**

```python
import hashlib

class ShardManager:
    """Manage database shards by user_id"""

    SHARD_COUNT = 16
    DATABASES = [
        "postgresql://user@shard-0.db:5432/files",
        "postgresql://user@shard-1.db:5432/files",
        # ... 14 more shards
    ]

    @staticmethod
    def get_shard_id(user_id: UUID) -> int:
        """Consistent hashing to shard"""
        hash_val = int(hashlib.md5(str(user_id).encode()).hexdigest(), 16)
        return hash_val % ShardManager.SHARD_COUNT

    @staticmethod
    def get_connection_string(user_id: UUID) -> str:
        """Get connection string for user's shard"""
        shard_id = ShardManager.get_shard_id(user_id)
        return ShardManager.DATABASES[shard_id]

# Usage
shard_conn = await asyncpg.connect(
    ShardManager.get_connection_string(user_id)
)
```

**Elasticsearch Configuration:**

```yaml
# elasticsearch.yml
cluster.name: file-storage-cluster
node.name: es-node-1
node.roles: [master, data, ingest]

# Performance tuning
indices.memory.index_buffer_size: 40%
thread_pool.search.queue_size: 1000
thread_pool.write.queue_size: 1000

# Sharding
index.number_of_shards: 30
index.number_of_replicas: 2
index.refresh_interval: 30s

# Search
search.max_buckets: 100000
```

**Kafka Pipeline for Async Indexing:**

```python
from kafka import KafkaProducer, KafkaConsumer
import json

# Producer: Send file events
producer = KafkaProducer(
    bootstrap_servers=['kafka-1:9092', 'kafka-2:9092', 'kafka-3:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

async def upload_file(user_id, filename, content):
    # ... save to S3 and database ...

    # Send indexing event
    producer.send('file-index-topic', {
        'user_id': str(user_id),
        'file_id': str(file_id),
        'action': 'index',
        'timestamp': datetime.utcnow().isoformat()
    })

# Consumer: Index files in Elasticsearch
consumer = KafkaConsumer(
    'file-index-topic',
    bootstrap_servers=['kafka-1:9092', 'kafka-2:9092', 'kafka-3:9092'],
    group_id='indexing-group',
    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
    max_poll_records=100
)

async def index_worker():
    for message in consumer:
        event = message.value
        if event['action'] == 'index':
            # Index in Elasticsearch
            es.index(
                index='files',
                id=event['file_id'],
                body={...}
            )
```

**Performance Targets:**
- Upload: 1-5 seconds (includes replication)
- Download: 100-500ms (with CDN)
- List directory: 20-100ms (cached)
- Search: 50-200ms (Elasticsearch)
- Concurrent users: 10,000+
- Availability: 99.99% (4 nines)

**Cost Estimation (AWS for 1B files, 10PB storage):**
- S3 Storage: 10PB × $23 = $230,000/month
- Data Transfer: $0.02/GB × 100TB avg = $2,000/month
- RDS (Multi-AZ sharded): $5,000/month
- Elasticsearch: $3,000/month
- Lambda/Workers: $500/month
- **Total: ~$240,500/month** (or $0.24 per GB stored)

---

## Decision Matrix by Requirements

### Choose Based on Your Needs:

**If You Prioritize:** **→ Use This Tier**
```
Cost                    → Tier 1 (SQLite + Local FS)
Simplicity              → Tier 1 (SQLite + Local FS)
Scalability             → Tier 3 (Sharded PostgreSQL)
High Availability       → Tier 3 (Multi-region)
Fast Search             → Tier 2+ (Elasticsearch)
Quick Time-to-Market    → Tier 1 (SQLite)
Enterprise Grade        → Tier 3 (Full stack)
```

### Growth Path Recommendations:

**Start with Tier 1 if:**
- MVP/POC phase
- < 100K files
- < 50GB storage
- Team < 50 people
- Budget < $1000/month

**Migrate to Tier 2 when:**
- 100K - 100M files
- > 50GB, < 1TB storage
- 50-1000 users
- Need full-text search
- Can spend $1K-10K/month

**Migrate to Tier 3 when:**
- > 100M files
- > 1TB storage
- > 1000 concurrent users
- Need multi-region redundancy
- Budget > $10K/month

---

## Migration Path Example

### Phase 1: SQLite + Local FS (Months 1-3)
```python
# storage/tier1_storage.py
class SimpleSQLiteStorage:
    """MVP implementation"""
    def __init__(self, db_path: str, storage_dir: str):
        self.db = sqlite3.connect(db_path)
        self.storage = Path(storage_dir)
```

### Phase 2: PostgreSQL + S3 (Months 4-12)
```python
# storage/tier2_storage.py
class PostgreSQLS3Storage:
    """Scalable implementation"""
    def __init__(self, db_pool: asyncpg.Pool, s3_client: S3Client):
        self.db = db_pool
        self.s3 = s3_client
```

### Phase 3: Sharded PostgreSQL + Elasticsearch (Months 12+)
```python
# storage/tier3_storage.py
class ShardedElasticsearchStorage:
    """Enterprise implementation"""
    def __init__(self, shard_manager: ShardManager,
                 es_client: Elasticsearch,
                 s3_multiregion: S3Multi):
        self.shards = shard_manager
        self.search = es_client
        self.storage = s3_multiregion
```

---

## Quick Reference: Tech Stack by Tier

### Tier 1 Stack
```
Frontend: HTML + Vanilla JS
Backend: Flask/FastAPI (single server)
Database: SQLite
Storage: Local filesystem
Search: SQL LIKE/GLOB
Deployment: Docker on single server
Monitoring: Basic application logs
```

### Tier 2 Stack
```
Frontend: React/Vue
Backend: FastAPI + Gunicorn/uWSGI
Database: PostgreSQL + pgBouncer
Storage: S3/MinIO
Search: PostgreSQL GIST + GIN
Cache: Redis
Deployment: Docker + Docker Compose
Load Balancer: nginx
Monitoring: Prometheus + Grafana
```

### Tier 3 Stack
```
Frontend: React/Vue + CDN
Backend: FastAPI + Kubernetes
Database: PostgreSQL (sharded) + RDS
Search: Elasticsearch (cluster)
Storage: S3 multi-region
Cache: Redis Cluster
Message Queue: Kafka
Deployment: Kubernetes + Helm
Load Balancer: Application Load Balancer
Monitoring: ELK Stack + DataDog
CDN: CloudFront/CloudFlare
```

---

## Performance Comparison Table

| Operation | Tier 1 | Tier 2 | Tier 3 |
|-----------|--------|--------|--------|
| Upload 100MB | 30s | 5s | 2s |
| Download 100MB | 20s | 2s | 500ms |
| List 1000 files | 500ms | 100ms | 50ms |
| Search 1M files | 5s | 500ms | 100ms |
| Concurrent users | 10 | 500 | 10,000 |
| Simultaneous uploads | 1-2 | 50 | 1,000 |
| Data duplication rate | 5% | 15% | 25% |
| Query latency p99 | 1s | 200ms | 50ms |

---

## Checklist: When to Upgrade Tier

### Upgrade to Tier 2 When:
- [ ] Database file > 1GB
- [ ] Single server CPU > 80% regularly
- [ ] Need multiple users editing simultaneously
- [ ] File storage > 100GB
- [ ] Need HA/disaster recovery
- [ ] Search latency > 1 second

### Upgrade to Tier 3 When:
- [ ] Database > 10GB
- [ ] S3 costs > $1000/month
- [ ] Need < 100ms search latency
- [ ] Multiple servers maxed out
- [ ] Need geographic distribution
- [ ] Compliance requires multi-region
- [ ] Team dedicated to infrastructure

---

## Cost Comparison

### For 10M Files (20GB storage), 100 Concurrent Users:

| Tier | Setup Time | Monthly Cost | Annual Cost |
|------|-----------|--------------|-------------|
| **Tier 1** | 1 week | $50-100 | $600-1,200 |
| **Tier 2** | 2-3 weeks | $500-1,000 | $6,000-12,000 |
| **Tier 3** | 4-6 weeks | $2,000-5,000 | $24,000-60,000 |

(Includes infrastructure, but not development/ops staff)

---

## Recommendation: Start with Tier 2

**For most production systems:**
- PostgreSQL is more flexible than SQLite
- S3 costs are minimal for reasonable data
- Scales to 100M+ files without redesign
- Good balance of cost vs. features
- Only $2-3K/month for solid foundation
- Supports team growth from 10 to 1000 users

**Tier 1 only if:**
- True MVP testing
- Single digit MB of files
- Budget constraints critical

**Tier 3 only if:**
- Already at 100M+ files
- Global user base needed
- Enterprise compliance required
