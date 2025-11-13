const fs = require('fs').promises;
const path = require('path');

/**
 * Abstract Storage Interface
 * All storage adapters must implement these methods
 */
class StorageAdapter {
  /**
   * Store a file
   * @param {Buffer} buffer - File content
   * @param {string} storagePath - Path/key where file should be stored
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} - Storage result with location info
   */
  async store(buffer, storagePath, metadata = {}) {
    throw new Error('store() must be implemented by storage adapter');
  }

  /**
   * Retrieve a file
   * @param {string} storagePath - Path/key of file to retrieve
   * @returns {Promise<Buffer>} - File content
   */
  async retrieve(storagePath) {
    throw new Error('retrieve() must be implemented by storage adapter');
  }

  /**
   * Delete a file
   * @param {string} storagePath - Path/key of file to delete
   * @returns {Promise<boolean>} - Success status
   */
  async delete(storagePath) {
    throw new Error('delete() must be implemented by storage adapter');
  }

  /**
   * Check if file exists
   * @param {string} storagePath - Path/key to check
   * @returns {Promise<boolean>} - Existence status
   */
  async exists(storagePath) {
    throw new Error('exists() must be implemented by storage adapter');
  }

  /**
   * Get file metadata
   * @param {string} storagePath - Path/key of file
   * @returns {Promise<Object>} - File metadata (size, modified date, etc.)
   */
  async getMetadata(storagePath) {
    throw new Error('getMetadata() must be implemented by storage adapter');
  }

  /**
   * Get a signed URL for temporary access (if supported)
   * @param {string} storagePath - Path/key of file
   * @param {number} expiresIn - Expiration in seconds
   * @returns {Promise<string|null>} - Signed URL or null if not supported
   */
  async getSignedUrl(storagePath, expiresIn = 3600) {
    return null; // Optional - not all adapters support this
  }
}

module.exports = StorageAdapter;
