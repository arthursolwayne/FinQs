# S3 Migration Guide

This guide explains how to seamlessly migrate from local filesystem storage to AWS S3.

## Overview

The dataroom filesystem uses a **storage adapter pattern** that allows you to switch between local filesystem and S3 storage with just environment variable changes. No code changes required!

## Architecture

```
┌─────────────────────────────────────┐
│     File Service (Business Logic)   │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│      Storage Adapter Interface      │
└─────────────┬───────────────────────┘
              │
      ┌───────┴────────┐
      │                │
      ▼                ▼
┌──────────┐    ┌──────────┐
│  Local   │    │    S3    │
│ Storage  │    │ Storage  │
└──────────┘    └──────────┘
```

Both adapters implement the same interface:
- `store(buffer, path, metadata)`
- `retrieve(path)`
- `delete(path)`
- `exists(path)`
- `getMetadata(path)`
- `getSignedUrl(path, expiresIn)` *(S3 only)*

## Quick Start: Switch to S3

### 1. Install S3 Dependencies

```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Or use the S3-enabled package.json:
```bash
cp package-s3.json package.json
npm install
```

### 2. Configure Environment Variables

```bash
# Copy S3 environment template
cp .env.s3.example .env

# Edit .env with your AWS credentials
```

Required variables:
```env
STORAGE_TYPE=s3
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### 3. Create S3 Bucket

Using AWS CLI:
```bash
# Create bucket
aws s3 mb s3://your-dataroom-bucket --region us-east-1

# Enable versioning (recommended for datarooms)
aws s3api put-bucket-versioning \
  --bucket your-dataroom-bucket \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket your-dataroom-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Enable CORS (if needed for direct browser uploads)
aws s3api put-bucket-cors \
  --bucket your-dataroom-bucket \
  --cors-configuration file://cors.json
```

Example `cors.json`:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-frontend-domain.com"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

### 4. Set S3 Bucket Policy (Optional)

For private dataroom files, use IAM roles instead of bucket policies.

Example restrictive policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT-ID:role/DataroomAppRole"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-dataroom-bucket/*"
    }
  ]
}
```

### 5. Restart Server

```bash
npm start
```

The storage adapter will automatically use S3!

## S3 Features

### Automatic Encryption
All files are encrypted at rest with AES-256:
```javascript
ServerSideEncryption: 'AES256'
```

### Signed URLs for Downloads
Instead of serving files directly, S3 generates temporary signed URLs:
```javascript
// Expires after 1 hour
const url = await storage.getSignedUrl(storagePath, 3600);
```

### Content-Addressable Storage
Same deduplication benefits as local storage:
```
s3://your-bucket/a1/b2/a1b2c3d4e5f6...{hash}.pdf
```

### Metadata Storage
File metadata stored as S3 object metadata:
```javascript
{
  contentType: 'application/pdf',
  originalName: 'document.pdf',
  contentHash: 'a1b2c3...',
  uploadedAt: '2024-01-15T10:30:00Z'
}
```

## CloudFront CDN (Optional)

For faster global access, use CloudFront:

### 1. Create CloudFront Distribution

```bash
aws cloudfront create-distribution \
  --origin-domain-name your-bucket.s3.amazonaws.com \
  --default-root-object index.html
```

### 2. Configure Environment

```env
AWS_CLOUDFRONT_DOMAIN=d1234567890abc.cloudfront.net
```

### 3. Benefits

- **Global Edge Locations**: Files cached closer to users
- **Lower Latency**: Faster downloads worldwide
- **Reduced S3 Costs**: Fewer direct S3 requests
- **DDoS Protection**: CloudFront Shield included

## IAM Permissions

### Minimal IAM Policy for Application

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::your-dataroom-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-dataroom-bucket"
    }
  ]
}
```

### Using IAM Roles (Recommended for EC2/ECS)

If running on AWS infrastructure, use IAM roles instead of access keys:

1. Create IAM role with above policy
2. Attach role to EC2 instance or ECS task
3. Remove `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from .env
4. SDK automatically uses instance role credentials

## Migration Strategies

### Option 1: Fresh Start (Recommended for New Deployments)

Simply set `STORAGE_TYPE=s3` before first deployment. All new files go to S3.

### Option 2: Migrate Existing Files

For existing deployments with local files:

```javascript
// migration-script.js
const { getStorage } = require('./src/storage');
const { query } = require('./src/db/database');
const fs = require('fs').promises;

async function migrateToS3() {
  // Get all files from database
  const result = await query('SELECT id, storage_path FROM files WHERE is_deleted = FALSE');

  const localStorage = StorageFactory.createAdapter('local', { baseDir: './uploads' });
  const s3Storage = StorageFactory.createAdapter('s3', {
    bucket: process.env.AWS_S3_BUCKET,
    region: process.env.AWS_REGION,
  });

  for (const file of result.rows) {
    try {
      // Read from local storage
      const buffer = await localStorage.retrieve(file.storage_path);

      // Upload to S3
      await s3Storage.store(buffer, file.storage_path, {
        contentType: file.mime_type,
      });

      console.log(`Migrated: ${file.id}`);
    } catch (error) {
      console.error(`Failed to migrate ${file.id}:`, error);
    }
  }

  console.log('Migration complete!');
}

migrateToS3();
```

Run migration:
```bash
node migration-script.js
```

### Option 3: Hybrid Approach

Keep existing files on local storage, new files go to S3:

1. Don't migrate old files
2. Set `STORAGE_TYPE=s3`
3. Storage adapter handles both (check database for storage location)

## Cost Optimization

### S3 Lifecycle Policies

Move old files to cheaper storage tiers:

```json
{
  "Rules": [
    {
      "Id": "ArchiveOldFiles",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

Apply policy:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket your-dataroom-bucket \
  --lifecycle-configuration file://lifecycle.json
```

### Storage Class Comparison

| Class | Use Case | Cost (per GB/month) | Retrieval Time |
|-------|----------|---------------------|----------------|
| Standard | Active files | $0.023 | Immediate |
| Standard-IA | Infrequent access | $0.0125 | Immediate |
| Glacier | Archive | $0.004 | Minutes to hours |
| Glacier Deep | Long-term archive | $0.00099 | 12+ hours |

### Cost Estimates

For a typical dataroom with 1TB storage:

**Local Storage (EC2 with EBS):**
- 1TB EBS: ~$100/month
- EC2 instance: ~$70/month
- **Total: ~$170/month**

**S3 Standard:**
- 1TB storage: ~$23/month
- 10K PUT requests: ~$0.05
- 100K GET requests: ~$0.40
- Data transfer: ~$9/GB (first TB)
- **Total: ~$25-50/month** (depending on traffic)

**S3 + CloudFront:**
- Same as above + CloudFront
- CloudFront: ~$0.085/GB
- **Total: ~$30-60/month**

## Performance Considerations

### Upload Performance

**Local Storage:**
- Direct disk I/O
- ~50-100 MB/s throughput
- Latency: <10ms

**S3:**
- Network upload to AWS
- ~100-200 MB/s with multipart upload
- Latency: 50-200ms (region-dependent)

### Download Performance

**Local Storage:**
- Direct file serve
- Limited to server bandwidth

**S3 + CloudFront:**
- Distributed edge locations
- Much faster for global users
- Automatic scaling

### Optimization Tips

1. **Enable S3 Transfer Acceleration** for faster uploads:
```env
AWS_S3_USE_ACCELERATION=true
```

2. **Use CloudFront** for downloads
3. **Enable multipart uploads** for files >100MB (future enhancement)
4. **Cache signed URLs** (valid for 1 hour)

## Security Best Practices

### 1. Enable S3 Bucket Encryption
Already handled by storage adapter:
```javascript
ServerSideEncryption: 'AES256'
```

### 2. Block Public Access
```bash
aws s3api put-public-access-block \
  --bucket your-dataroom-bucket \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
    IgnorePublicAcls=true,\
    BlockPublicPolicy=true,\
    RestrictPublicBuckets=true
```

### 3. Enable Versioning
```bash
aws s3api put-bucket-versioning \
  --bucket your-dataroom-bucket \
  --versioning-configuration Status=Enabled
```

### 4. Enable Access Logging
```bash
aws s3api put-bucket-logging \
  --bucket your-dataroom-bucket \
  --bucket-logging-status file://logging.json
```

### 5. Use Signed URLs
Never expose S3 URLs directly. Always use signed URLs with expiration.

## Monitoring

### CloudWatch Metrics

Monitor these S3 metrics:
- `NumberOfObjects` - Total objects in bucket
- `BucketSizeBytes` - Total storage used
- `AllRequests` - API request count
- `4xxErrors` - Client errors
- `5xxErrors` - Server errors

### Alarms

Set up CloudWatch alarms:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name high-4xx-errors \
  --metric-name 4xxErrors \
  --namespace AWS/S3 \
  --statistic Sum \
  --period 300 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold
```

## Troubleshooting

### Upload Fails

**Error:** `Access Denied`
- Check IAM permissions
- Verify bucket policy
- Ensure credentials are correct

**Error:** `Bucket does not exist`
- Verify `AWS_S3_BUCKET` is correct
- Check region matches bucket region

### Download Issues

**Error:** `SignatureDoesNotMatch`
- Check system time is synchronized
- Verify AWS credentials are correct

**Error:** `RequestTimeTooSkewed`
- Synchronize server clock with NTP

### Performance Issues

**Slow uploads:**
- Enable S3 Transfer Acceleration
- Check network bandwidth
- Consider multipart upload for large files

**Slow downloads:**
- Use CloudFront CDN
- Check if client is far from S3 region
- Verify signed URL expiration

## Comparison: Local vs S3

| Feature | Local Storage | S3 Storage |
|---------|--------------|------------|
| **Setup Complexity** | Simple | Moderate |
| **Scalability** | Limited by disk | Unlimited |
| **Durability** | Single server | 99.999999999% |
| **Availability** | Single point of failure | 99.99% |
| **Cost (1TB)** | ~$170/month (EC2+EBS) | ~$25/month |
| **Global Access** | Slow from distant locations | Fast with CloudFront |
| **Backup** | Manual | Automatic |
| **Disaster Recovery** | Complex | Built-in |
| **Compliance** | Self-managed | AWS-certified |

## Conclusion

**Use Local Storage when:**
- Development/testing environment
- Small scale (<100GB)
- All users in same geographic location
- Budget is extremely tight

**Use S3 when:**
- Production environment
- Scalability needed
- Global user base
- Compliance requirements
- Want automatic backups and versioning

For a **real-world dataroom deployment**, **S3 is strongly recommended** for its reliability, scalability, and cost-effectiveness.

## Next Steps

1. ✅ Install AWS SDK dependencies
2. ✅ Configure .env with S3 credentials
3. ✅ Create S3 bucket with encryption
4. ✅ Test uploads and downloads
5. ✅ Set up CloudFront (optional but recommended)
6. ✅ Configure lifecycle policies for cost optimization
7. ✅ Set up monitoring and alerts
8. ✅ Test disaster recovery procedures

Your dataroom filesystem is now ready for production S3 deployment! 🚀
