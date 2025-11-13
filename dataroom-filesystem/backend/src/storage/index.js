const LocalStorageAdapter = require('./LocalStorageAdapter');
const S3StorageAdapter = require('./S3StorageAdapter');

/**
 * Storage Factory
 * Creates the appropriate storage adapter based on configuration
 */
class StorageFactory {
  /**
   * Create storage adapter based on environment configuration
   * @returns {StorageAdapter} - Configured storage adapter instance
   */
  static create() {
    const storageType = process.env.STORAGE_TYPE || 'local';

    switch (storageType) {
      case 'local':
        return new LocalStorageAdapter(process.env.UPLOAD_DIR || './uploads');

      case 's3':
        return new S3StorageAdapter({
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          cdnDomain: process.env.AWS_CLOUDFRONT_DOMAIN,
        });

      default:
        throw new Error(`Unsupported storage type: ${storageType}`);
    }
  }

  /**
   * Create specific storage adapter
   * @param {string} type - Storage type ('local' or 's3')
   * @param {Object} config - Adapter configuration
   * @returns {StorageAdapter} - Configured storage adapter instance
   */
  static createAdapter(type, config = {}) {
    switch (type) {
      case 'local':
        return new LocalStorageAdapter(config.baseDir);

      case 's3':
        return new S3StorageAdapter(config);

      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }
}

// Export singleton instance for application-wide use
let storageInstance = null;

function getStorage() {
  if (!storageInstance) {
    storageInstance = StorageFactory.create();
    console.log(`Storage initialized: ${process.env.STORAGE_TYPE || 'local'}`);
  }
  return storageInstance;
}

module.exports = {
  StorageFactory,
  getStorage,
};
