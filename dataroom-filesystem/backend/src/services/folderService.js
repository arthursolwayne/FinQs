const { query, getClient } = require('../db/database');
const { sanitizeFilename } = require('../utils/filenameSanitizer');
const { createAuditLog } = require('./auditService');

/**
 * Create a new folder
 */
async function createFolder(userId, name, parentId = null, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Sanitize folder name
    const sanitizedName = sanitizeFilename(name).replace(/\.[^.]+$/, ''); // Remove extension if any

    // Build path
    let folderPath = sanitizedName;
    if (parentId) {
      // Get parent folder path
      const parentResult = await client.query(
        'SELECT path, user_id FROM folders WHERE id = $1 AND is_deleted = FALSE',
        [parentId]
      );

      if (parentResult.rows.length === 0) {
        throw new Error('Parent folder not found');
      }

      if (parentResult.rows[0].user_id !== userId) {
        throw new Error('Access denied to parent folder');
      }

      folderPath = `${parentResult.rows[0].path}/${sanitizedName}`;
    }

    // Check if folder with same path already exists
    const existingFolder = await client.query(
      'SELECT id FROM folders WHERE user_id = $1 AND path = $2 AND is_deleted = FALSE',
      [userId, folderPath]
    );

    if (existingFolder.rows.length > 0) {
      throw new Error('Folder with this name already exists in this location');
    }

    // Create folder
    const result = await client.query(
      `INSERT INTO folders (user_id, parent_id, name, path)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, parent_id, name, path, created_at`,
      [userId, parentId, sanitizedName, folderPath]
    );

    const folder = result.rows[0];

    // Create audit log
    await createAuditLog({
      userId,
      action: 'create_folder',
      resourceType: 'folder',
      resourceId: folder.id,
      ipAddress,
      metadata: {
        folderName: sanitizedName,
        path: folderPath,
      },
    });

    await client.query('COMMIT');

    return folder;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get folder by ID
 */
async function getFolderById(folderId, userId) {
  const result = await query(
    `SELECT f.*,
            (SELECT COUNT(*) FROM folders WHERE parent_id = f.id AND is_deleted = FALSE) as subfolder_count,
            (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_deleted = FALSE) as file_count
     FROM folders f
     WHERE f.id = $1 AND f.user_id = $2 AND f.is_deleted = FALSE`,
    [folderId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Folder not found or access denied');
  }

  return result.rows[0];
}

/**
 * List folders
 */
async function listFolders(userId, parentId = null, options = {}) {
  const {
    limit = 100,
    offset = 0,
    sortBy = 'name',
    sortOrder = 'ASC',
  } = options;

  const result = await query(
    `SELECT f.*,
            (SELECT COUNT(*) FROM folders WHERE parent_id = f.id AND is_deleted = FALSE) as subfolder_count,
            (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_deleted = FALSE) as file_count
     FROM folders f
     WHERE f.user_id = $1 AND f.parent_id ${parentId ? '= $2' : 'IS NULL'} AND f.is_deleted = FALSE
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $3 OFFSET $4`,
    parentId ? [userId, parentId, limit, offset] : [userId, limit, offset]
  );

  return result.rows;
}

/**
 * Get folder contents (folders + files)
 */
async function getFolderContents(userId, folderId = null) {
  // Get folders
  const folders = await listFolders(userId, folderId);

  // Get files
  const fileResult = await query(
    `SELECT id, original_name, sanitized_name, mime_type, size,
            extension, preview_path, created_at, updated_at
     FROM files
     WHERE user_id = $1 AND folder_id ${folderId ? '= $2' : 'IS NULL'} AND is_deleted = FALSE
     ORDER BY original_name ASC`,
    folderId ? [userId, folderId] : [userId]
  );

  return {
    folders,
    files: fileResult.rows,
  };
}

/**
 * Get folder tree (hierarchical structure)
 */
async function getFolderTree(userId, rootFolderId = null) {
  // Use recursive CTE to build tree
  const result = await query(
    `WITH RECURSIVE folder_tree AS (
       -- Base case: root folders or specified folder
       SELECT id, user_id, parent_id, name, path, 0 as depth
       FROM folders
       WHERE user_id = $1
         AND (parent_id ${rootFolderId ? '= $2' : 'IS NULL'} OR id ${rootFolderId ? '= $2' : 'IS NULL'})
         AND is_deleted = FALSE

       UNION ALL

       -- Recursive case: child folders
       SELECT f.id, f.user_id, f.parent_id, f.name, f.path, ft.depth + 1
       FROM folders f
       INNER JOIN folder_tree ft ON f.parent_id = ft.id
       WHERE f.is_deleted = FALSE AND ft.depth < 10
     )
     SELECT
       ft.*,
       (SELECT COUNT(*) FROM folders WHERE parent_id = ft.id AND is_deleted = FALSE) as subfolder_count,
       (SELECT COUNT(*) FROM files WHERE folder_id = ft.id AND is_deleted = FALSE) as file_count
     FROM folder_tree ft
     ORDER BY ft.path`,
    rootFolderId ? [userId, rootFolderId] : [userId]
  );

  return buildTreeStructure(result.rows);
}

/**
 * Helper function to build tree structure from flat array
 */
function buildTreeStructure(folders) {
  const folderMap = new Map();
  const tree = [];

  // Create map of all folders
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  // Build tree structure
  folders.forEach(folder => {
    const node = folderMap.get(folder.id);
    if (folder.parent_id && folderMap.has(folder.parent_id)) {
      folderMap.get(folder.parent_id).children.push(node);
    } else {
      tree.push(node);
    }
  });

  return tree;
}

/**
 * Get breadcrumb path for folder
 */
async function getBreadcrumbs(folderId, userId) {
  const result = await query(
    `WITH RECURSIVE folder_path AS (
       SELECT id, parent_id, name, path, 0 as depth
       FROM folders
       WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE

       UNION ALL

       SELECT f.id, f.parent_id, f.name, f.path, fp.depth + 1
       FROM folders f
       INNER JOIN folder_path fp ON f.id = fp.parent_id
       WHERE f.is_deleted = FALSE
     )
     SELECT id, name, path
     FROM folder_path
     ORDER BY depth DESC`,
    [folderId, userId]
  );

  return result.rows;
}

/**
 * Rename folder
 */
async function renameFolder(folderId, userId, newName, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get folder
    const folderResult = await client.query(
      'SELECT id, parent_id, name, path FROM folders WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [folderId, userId]
    );

    if (folderResult.rows.length === 0) {
      throw new Error('Folder not found');
    }

    const folder = folderResult.rows[0];
    const sanitizedName = sanitizeFilename(newName).replace(/\.[^.]+$/, '');

    // Build new path
    let newPath = sanitizedName;
    if (folder.parent_id) {
      const parentResult = await client.query(
        'SELECT path FROM folders WHERE id = $1',
        [folder.parent_id]
      );
      newPath = `${parentResult.rows[0].path}/${sanitizedName}`;
    }

    // Update folder
    await client.query(
      'UPDATE folders SET name = $1, path = $2, updated_at = NOW() WHERE id = $3',
      [sanitizedName, newPath, folderId]
    );

    // Update all descendant folders' paths
    await client.query(
      `UPDATE folders
       SET path = REPLACE(path, $1, $2),
           updated_at = NOW()
       WHERE path LIKE $3 AND user_id = $4`,
      [folder.path, newPath, `${folder.path}/%`, userId]
    );

    await createAuditLog({
      userId,
      action: 'rename_folder',
      resourceType: 'folder',
      resourceId: folderId,
      ipAddress,
      metadata: {
        oldName: folder.name,
        newName: sanitizedName,
      },
    });

    await client.query('COMMIT');

    return { id: folderId, name: sanitizedName, path: newPath };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete folder (soft delete)
 */
async function deleteFolder(folderId, userId, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if folder exists
    const folderResult = await client.query(
      'SELECT id, name FROM folders WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [folderId, userId]
    );

    if (folderResult.rows.length === 0) {
      throw new Error('Folder not found');
    }

    const folder = folderResult.rows[0];

    // Soft delete folder and all descendants
    await client.query(
      `UPDATE folders
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id IN (
         SELECT descendant_id
         FROM folder_closure
         WHERE ancestor_id = $1
       ) AND user_id = $2`,
      [folderId, userId]
    );

    // Soft delete all files in folder and descendants
    await client.query(
      `UPDATE files
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE folder_id IN (
         SELECT descendant_id
         FROM folder_closure
         WHERE ancestor_id = $1
       ) AND user_id = $2`,
      [folderId, userId]
    );

    await createAuditLog({
      userId,
      action: 'delete_folder',
      resourceType: 'folder',
      resourceId: folderId,
      ipAddress,
      metadata: {
        folderName: folder.name,
      },
    });

    await client.query('COMMIT');

    return { success: true, message: 'Folder deleted successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Move folder to different parent
 */
async function moveFolder(folderId, userId, newParentId, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get folder
    const folderResult = await client.query(
      'SELECT id, name, path FROM folders WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [folderId, userId]
    );

    if (folderResult.rows.length === 0) {
      throw new Error('Folder not found');
    }

    const folder = folderResult.rows[0];

    // Check if moving to descendant (not allowed)
    if (newParentId) {
      const descendantCheck = await client.query(
        'SELECT 1 FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
        [folderId, newParentId]
      );

      if (descendantCheck.rows.length > 0) {
        throw new Error('Cannot move folder to its own descendant');
      }
    }

    // Build new path
    let newPath = folder.name;
    if (newParentId) {
      const parentResult = await client.query(
        'SELECT path, user_id FROM folders WHERE id = $1 AND is_deleted = FALSE',
        [newParentId]
      );

      if (parentResult.rows.length === 0) {
        throw new Error('Parent folder not found');
      }

      if (parentResult.rows[0].user_id !== userId) {
        throw new Error('Access denied to parent folder');
      }

      newPath = `${parentResult.rows[0].path}/${folder.name}`;
    }

    // Update folder
    await client.query(
      'UPDATE folders SET parent_id = $1, path = $2, updated_at = NOW() WHERE id = $3',
      [newParentId, newPath, folderId]
    );

    // Update all descendant folders' paths
    await client.query(
      `UPDATE folders
       SET path = REPLACE(path, $1, $2),
           updated_at = NOW()
       WHERE path LIKE $3 AND user_id = $4`,
      [folder.path, newPath, `${folder.path}/%`, userId]
    );

    await createAuditLog({
      userId,
      action: 'move_folder',
      resourceType: 'folder',
      resourceId: folderId,
      ipAddress,
      metadata: {
        folderName: folder.name,
        newParentId,
      },
    });

    await client.query('COMMIT');

    return { id: folderId, parent_id: newParentId, path: newPath };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createFolder,
  getFolderById,
  listFolders,
  getFolderContents,
  getFolderTree,
  getBreadcrumbs,
  renameFolder,
  deleteFolder,
  moveFolder,
};
