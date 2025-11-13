const StorageAdapter = require('./StorageAdapter');

/**
 * AWS S3 Storage Adapter
 * Stores files in Amazon S3 with optional CloudFront CDN support
 */
class S3StorageAdapter extends StorageAdapter {
  constructor(config = {}) {
    super();

    // Lazy-load AWS SDK to avoid requiring it when using local storage
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    this.bucket = config.bucket || process.env.AWS_S3_BUCKET;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.accessKeyId = config.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    this.cdnDomain = config.cdnDomain || process.env.AWS_CLOUDFRONT_DOMAIN;

    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      credentials: this.accessKeyId && this.secretAccessKey ? {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      } : undefined, // Use IAM role if credentials not provided
    });

    this.getSignedUrlFn = getSignedUrl;
    this.commands = {
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
      HeadObjectCommand,
    };
  }

  /**
   * Store a file in S3
   */
  async store(buffer, storagePath, metadata = {}) {
    const { PutObjectCommand } = this.commands;

    const params = {
      Bucket: this.bucket,
      Key: storagePath,
      Body: buffer,
      ServerSideEncryption: 'AES256', // Encrypt at rest
      Metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      },
    };

    // Add Content-Type if provided in metadata
    if (metadata.contentType) {
      params.ContentType = metadata.contentType;
    }

    // Add ACL if public access needed (default is private)
    if (metadata.public) {
      params.ACL = 'public-read';
    }

    await this.s3Client.send(new PutObjectCommand(params));

    return {
      location: this.cdnDomain
        ? `https://${this.cdnDomain}/${storagePath}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${storagePath}`,
      adapter: 's3',
      bucket: this.bucket,
      key: storagePath,
    };
  }

  /**
   * Retrieve a file from S3
   */
  async retrieve(storagePath) {
    const { GetObjectCommand } = this.commands;

    const params = {
      Bucket: this.bucket,
      Key: storagePath,
    };

    const response = await this.s3Client.send(new GetObjectCommand(params));

    // Convert stream to buffer
    return await this.streamToBuffer(response.Body);
  }

  /**
   * Delete a file from S3
   */
  async delete(storagePath) {
    try {
      const { DeleteObjectCommand } = this.commands;

      const params = {
        Bucket: this.bucket,
        Key: storagePath,
      };

      await this.s3Client.send(new DeleteObjectCommand(params));
      return true;
    } catch (error) {
      // S3 returns success even if object doesn't exist
      return true;
    }
  }

  /**
   * Check if file exists in S3
   */
  async exists(storagePath) {
    try {
      const { HeadObjectCommand } = this.commands;

      const params = {
        Bucket: this.bucket,
        Key: storagePath,
      };

      await this.s3Client.send(new HeadObjectCommand(params));
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getMetadata(storagePath) {
    const { HeadObjectCommand } = this.commands;

    const params = {
      Bucket: this.bucket,
      Key: storagePath,
    };

    const response = await this.s3Client.send(new HeadObjectCommand(params));

    return {
      size: response.ContentLength,
      modified: response.LastModified,
      contentType: response.ContentType,
      etag: response.ETag,
      metadata: response.Metadata,
    };
  }

  /**
   * Get a signed URL for temporary access to S3 object
   */
  async getSignedUrl(storagePath, expiresIn = 3600) {
    const { GetObjectCommand } = this.commands;

    const params = {
      Bucket: this.bucket,
      Key: storagePath,
    };

    const command = new GetObjectCommand(params);

    // Generate signed URL that expires after specified seconds
    const signedUrl = await this.getSignedUrlFn(this.s3Client, command, {
      expiresIn,
    });

    return signedUrl;
  }

  /**
   * Helper: Convert stream to buffer
   */
  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * Batch delete multiple files (S3 specific optimization)
   */
  async batchDelete(storagePaths) {
    const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

    const params = {
      Bucket: this.bucket,
      Delete: {
        Objects: storagePaths.map(key => ({ Key: key })),
        Quiet: true,
      },
    };

    await this.s3Client.send(new DeleteObjectsCommand(params));
    return true;
  }

  /**
   * Copy file within S3 (useful for duplication without download/upload)
   */
  async copy(sourceKey, destinationKey) {
    const { CopyObjectCommand } = require('@aws-sdk/client-s3');

    const params = {
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destinationKey,
    };

    await this.s3Client.send(new CopyObjectCommand(params));

    return {
      location: this.cdnDomain
        ? `https://${this.cdnDomain}/${destinationKey}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${destinationKey}`,
      adapter: 's3',
      bucket: this.bucket,
      key: destinationKey,
    };
  }
}

module.exports = S3StorageAdapter;
