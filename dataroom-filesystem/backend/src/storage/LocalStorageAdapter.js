const fs = require('fs').promises;
const path = require('path');
const StorageAdapter = require('./StorageAdapter');

/**
 * Local Filesystem Storage Adapter
 * Stores files on local disk with sharded directory structure
 */
class LocalStorageAdapter extends StorageAdapter {
  constructor(baseDir = './uploads') {
    super();
    this.baseDir = baseDir;
  }

  /**
   * Store a file on local filesystem
   */
  async store(buffer, storagePath, metadata = {}) {
    const fullPath = path.join(this.baseDir, storagePath);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Write file with read-only permissions
    await fs.writeFile(fullPath, buffer, { mode: 0o644 });

    return {
      location: fullPath,
      adapter: 'local',
      path: storagePath,
    };
  }

  /**
   * Retrieve a file from local filesystem
   */
  async retrieve(storagePath) {
    const fullPath = path.join(this.baseDir, storagePath);
    return await fs.readFile(fullPath);
  }

  /**
   * Delete a file from local filesystem
   */
  async delete(storagePath) {
    try {
      const fullPath = path.join(this.baseDir, storagePath);
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true; // File doesn't exist, consider it deleted
      }
      throw error;
    }
  }

  /**
   * Check if file exists on local filesystem
   */
  async exists(storagePath) {
    try {
      const fullPath = path.join(this.baseDir, storagePath);
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata from local filesystem
   */
  async getMetadata(storagePath) {
    const fullPath = path.join(this.baseDir, storagePath);
    const stats = await fs.stat(fullPath);

    return {
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      isFile: stats.isFile(),
    };
  }

  /**
   * Get full path for file (local filesystem specific)
   */
  getFullPath(storagePath) {
    return path.join(this.baseDir, storagePath);
  }
}

module.exports = LocalStorageAdapter;
