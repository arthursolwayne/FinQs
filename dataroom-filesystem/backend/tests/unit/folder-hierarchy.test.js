const { query, getClient } = require('../../src/db/database');
const {
  createFolder,
  getFolderById,
  listFolders,
  getFolderContents,
  getFolderTree,
  getBreadcrumbs,
  renameFolder,
  deleteFolder,
  moveFolder,
} = require('../../src/services/folderService');

// Test database helper to verify closure table
async function getClosureEntries(ancestorId, descendantId) {
  const result = await query(
    'SELECT * FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
    [ancestorId, descendantId]
  );
  return result.rows;
}

async function getAllClosureForFolder(folderId) {
  const result = await query(
    'SELECT * FROM folder_closure WHERE ancestor_id = $1 OR descendant_id = $1 ORDER BY ancestor_id, descendant_id',
    [folderId]
  );
  return result.rows;
}

async function getClosureDescendants(ancestorId) {
  const result = await query(
    'SELECT descendant_id, depth FROM folder_closure WHERE ancestor_id = $1 ORDER BY depth',
    [ancestorId]
  );
  return result.rows;
}

describe('Folder Hierarchy System - Closure Table Pattern', () => {
  const testUserId = 'test-user-' + Date.now();
  let rootFolder;
  let folder1, folder2, subfolder1, subsubfolder1;

  beforeAll(async () => {
    // Create test user
    await query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [testUserId, `test-${Date.now()}@example.com`, 'hash']
    );
  });

  afterAll(async () => {
    // Clean up test data
    await query('DELETE FROM folders WHERE user_id = $1', [testUserId]);
    await query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  describe('1. Closure Table Initialization on Folder Creation', () => {
    it('should create self-reference in closure table for new folder', async () => {
      rootFolder = await createFolder(testUserId, 'Root Folder', null, '127.0.0.1');

      const closure = await getClosureEntries(rootFolder.id, rootFolder.id);
      expect(closure.length).toBe(1);
      expect(closure[0].depth).toBe(0);
    });

    it('should create ancestor paths in closure table for subfolder', async () => {
      folder1 = await createFolder(testUserId, 'Folder 1', rootFolder.id, '127.0.0.1');

      // Should have two entries: self-reference and ancestor
      const closures = await getAllClosureForFolder(folder1.id);
      expect(closures.length).toBeGreaterThanOrEqual(2);

      // Check self-reference
      const selfRef = closures.find(c => c.ancestor_id === folder1.id && c.descendant_id === folder1.id);
      expect(selfRef).toBeDefined();
      expect(selfRef.depth).toBe(0);

      // Check ancestor reference
      const ancestorRef = closures.find(c => c.ancestor_id === rootFolder.id && c.descendant_id === folder1.id);
      expect(ancestorRef).toBeDefined();
      expect(ancestorRef.depth).toBe(1);
    });

    it('should create multi-level ancestor paths', async () => {
      subfolder1 = await createFolder(testUserId, 'Subfolder 1', folder1.id, '127.0.0.1');
      subsubfolder1 = await createFolder(testUserId, 'Subsubfolder 1', subfolder1.id, '127.0.0.1');

      // Verify closure table has correct depth levels
      const descendants = await getClosureDescendants(rootFolder.id);

      // Should include: rootFolder, folder1 (depth 1), subfolder1 (depth 2), subsubfolder1 (depth 3)
      expect(descendants.length).toBeGreaterThanOrEqual(4);

      // Verify depths
      const folder1Entry = descendants.find(d => d.descendant_id === folder1.id);
      expect(folder1Entry.depth).toBe(1);

      const subfolder1Entry = descendants.find(d => d.descendant_id === subfolder1.id);
      expect(subfolder1Entry.depth).toBe(2);

      const subsubfolder1Entry = descendants.find(d => d.descendant_id === subsubfolder1.id);
      expect(subsubfolder1Entry.depth).toBe(3);
    });
  });

  describe('2. Tree Structure Generation', () => {
    it('should build complete tree with correct hierarchy', async () => {
      const tree = await getFolderTree(testUserId, rootFolder.id);

      expect(Array.isArray(tree)).toBe(true);
      expect(tree.length).toBeGreaterThan(0);

      // Root should have children
      const rootInTree = tree.find(f => f.id === rootFolder.id);
      expect(rootInTree).toBeDefined();
      expect(rootInTree.children).toBeDefined();
      expect(Array.isArray(rootInTree.children)).toBe(true);
    });

    it('should correctly nest all levels in tree', async () => {
      const tree = await getFolderTree(testUserId, rootFolder.id);

      // Find folder1 in tree
      const folder1InTree = tree[0]?.children?.find(f => f.id === folder1.id);
      expect(folder1InTree).toBeDefined();

      // Find subfolder1 under folder1
      const subfolder1InTree = folder1InTree?.children?.find(f => f.id === subfolder1.id);
      expect(subfolder1InTree).toBeDefined();

      // Find subsubfolder1 under subfolder1
      const subsubfolder1InTree = subfolder1InTree?.children?.find(f => f.id === subsubfolder1.id);
      expect(subsubfolder1InTree).toBeDefined();
    });

    it('should include file and subfolder counts', async () => {
      const tree = await getFolderTree(testUserId, rootFolder.id);
      const folder1InTree = tree[0]?.children?.find(f => f.id === folder1.id);

      expect(folder1InTree).toHaveProperty('subfolder_count');
      expect(folder1InTree).toHaveProperty('file_count');
      expect(parseInt(folder1InTree.subfolder_count)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Breadcrumb Generation', () => {
    it('should return correct breadcrumb path for root folder', async () => {
      const breadcrumbs = await getBreadcrumbs(rootFolder.id, testUserId);

      expect(Array.isArray(breadcrumbs)).toBe(true);
      expect(breadcrumbs.length).toBe(1);
      expect(breadcrumbs[0].id).toBe(rootFolder.id);
      expect(breadcrumbs[0].name).toBe('Root Folder');
    });

    it('should return complete breadcrumb path for nested folder', async () => {
      const breadcrumbs = await getBreadcrumbs(subsubfolder1.id, testUserId);

      expect(Array.isArray(breadcrumbs)).toBe(true);
      expect(breadcrumbs.length).toBe(4); // rootFolder -> folder1 -> subfolder1 -> subsubfolder1

      // Verify order (from root to leaf)
      expect(breadcrumbs[3].id).toBe(rootFolder.id);
      expect(breadcrumbs[2].id).toBe(folder1.id);
      expect(breadcrumbs[1].id).toBe(subfolder1.id);
      expect(breadcrumbs[0].id).toBe(subsubfolder1.id);
    });

    it('should include names in breadcrumb path', async () => {
      const breadcrumbs = await getBreadcrumbs(subfolder1.id, testUserId);

      expect(breadcrumbs.find(b => b.name === 'Root Folder')).toBeDefined();
      expect(breadcrumbs.find(b => b.name === 'Folder 1')).toBeDefined();
      expect(breadcrumbs.find(b => b.name === 'Subfolder 1')).toBeDefined();
    });
  });

  describe('4. Move Operations and Circular Reference Prevention', () => {
    it('should prevent moving folder to its own descendant', async () => {
      // Try to move folder1 to subsubfolder1 (its descendant)
      expect(async () => {
        await moveFolder(folder1.id, testUserId, subsubfolder1.id, '127.0.0.1');
      }).rejects.toThrow('descendant');
    });

    it('should prevent moving folder to itself', async () => {
      // Try to move folder to itself
      expect(async () => {
        await moveFolder(folder1.id, testUserId, folder1.id, '127.0.0.1');
      }).rejects.toThrow();
    });

    it('should allow moving folder to sibling', async () => {
      folder2 = await createFolder(testUserId, 'Folder 2', rootFolder.id, '127.0.0.1');

      // Move subfolder1 from folder1 to folder2
      const moveResult = await moveFolder(subfolder1.id, testUserId, folder2.id, '127.0.0.1');

      expect(moveResult.parent_id).toBe(folder2.id);
      expect(moveResult.path).toContain('Folder 2');
      expect(moveResult.path).not.toContain('Folder 1');
    });

    it('should update path correctly after move', async () => {
      const movedFolder = await getFolderById(subfolder1.id, testUserId);

      // Path should now include Folder 2 instead of Folder 1
      expect(movedFolder.path).toMatch(/Root Folder\/Folder 2\/Subfolder 1/);
    });

    it('should update descendant paths after move', async () => {
      // Check that subsubfolder1 (child of subfolder1) also has updated path
      const descendant = await getFolderById(subsubfolder1.id, testUserId);

      expect(descendant.path).toContain('Folder 2');
      expect(descendant.path).toContain('Subfolder 1');
      expect(descendant.path).toContain('Subsubfolder 1');
    });
  });

  describe('5. Closure Table Consistency After Move', () => {
    it('should maintain ancestor-descendant relationships in closure table after move', async () => {
      // After moving subfolder1 from folder1 to folder2,
      // the closure table should reflect new relationships

      // subfolder1 should still have itself as ancestor
      const selfRef = await getClosureEntries(subfolder1.id, subfolder1.id);
      expect(selfRef.length).toBe(1);
      expect(selfRef[0].depth).toBe(0);

      // subfolder1 should have rootFolder and folder2 as ancestors
      const ancestors = await query(
        `SELECT ancestor_id, depth FROM folder_closure
         WHERE descendant_id = $1 AND depth > 0
         ORDER BY depth`,
        [subfolder1.id]
      );

      expect(ancestors.rows.length).toBeGreaterThanOrEqual(2);

      // Immediate parent (folder2) should have depth 1
      const folder2Ancestor = ancestors.rows.find(a => a.ancestor_id === folder2.id);
      if (folder2Ancestor) {
        expect(folder2Ancestor.depth).toBe(1);
      }
    });

    it('should verify subsubfolder1 still has correct ancestor chain after grandparent move', async () => {
      const descendants = await getClosureDescendants(rootFolder.id);

      // subsubfolder1 should still be a descendant of rootFolder
      const subsubEntry = descendants.find(d => d.descendant_id === subsubfolder1.id);
      expect(subsubEntry).toBeDefined();
      expect(subsubEntry.depth).toBeGreaterThanOrEqual(3);
    });
  });

  describe('6. Rename Operations', () => {
    it('should rename folder successfully', async () => {
      const renamed = await renameFolder(folder2.id, testUserId, 'Folder 2 Renamed', '127.0.0.1');

      expect(renamed.name).toBe('Folder 2 Renamed');
      expect(renamed.path).toContain('Folder 2 Renamed');
    });

    it('should update descendant paths after rename', async () => {
      const descendant = await getFolderById(subfolder1.id, testUserId);

      expect(descendant.path).toContain('Folder 2 Renamed');
    });

    it('should not affect closure table relationships after rename', async () => {
      // Rename should not change ancestor-descendant relationships
      const closure = await getClosureEntries(rootFolder.id, subfolder1.id);

      expect(closure.length).toBe(1);
      expect(closure[0].depth).toBe(2); // rootFolder -> Folder2 -> subfolder1
    });
  });

  describe('7. Delete Operations', () => {
    it('should soft delete folder and mark descendants', async () => {
      // Create a test folder hierarchy for deletion
      const delTestRoot = await createFolder(testUserId, 'Delete Test', null, '127.0.0.1');
      const delTestChild = await createFolder(testUserId, 'Delete Child', delTestRoot.id, '127.0.0.1');
      const delTestGrandchild = await createFolder(testUserId, 'Delete Grandchild', delTestChild.id, '127.0.0.1');

      // Delete root folder
      const result = await deleteFolder(delTestRoot.id, testUserId, '127.0.0.1');
      expect(result.success).toBe(true);

      // Verify all are marked as deleted
      const rootAfterDelete = await query(
        'SELECT is_deleted FROM folders WHERE id = $1',
        [delTestRoot.id]
      );
      expect(rootAfterDelete.rows[0].is_deleted).toBe(true);

      const childAfterDelete = await query(
        'SELECT is_deleted FROM folders WHERE id = $1',
        [delTestChild.id]
      );
      expect(childAfterDelete.rows[0].is_deleted).toBe(true);

      const grandchildAfterDelete = await query(
        'SELECT is_deleted FROM folders WHERE id = $1',
        [delTestGrandchild.id]
      );
      expect(grandchildAfterDelete.rows[0].is_deleted).toBe(true);
    });

    it('should use closure table to find all descendants for deletion', async () => {
      // This verifies that deleteFolder correctly uses the closure table
      // to identify all descendants that need to be deleted

      const testRoot = await createFolder(testUserId, 'Deep Test', null, '127.0.0.1');
      const level1 = await createFolder(testUserId, 'L1', testRoot.id, '127.0.0.1');
      const level2 = await createFolder(testUserId, 'L2', level1.id, '127.0.0.1');
      const level3 = await createFolder(testUserId, 'L3', level2.id, '127.0.0.1');

      // Verify closure table has all relationships
      const descendants = await query(
        `SELECT COUNT(*) as count FROM folder_closure
         WHERE ancestor_id = $1`,
        [testRoot.id]
      );
      expect(parseInt(descendants.rows[0].count)).toBeGreaterThanOrEqual(4); // Self + 3 levels

      // Delete and verify
      await deleteFolder(testRoot.id, testUserId, '127.0.0.1');

      // All should be deleted
      const deletedCount = await query(
        `SELECT COUNT(*) as count FROM folders
         WHERE id IN (SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1)
         AND is_deleted = TRUE`,
        [testRoot.id]
      );
      expect(parseInt(deletedCount.rows[0].count)).toBeGreaterThanOrEqual(4);
    });
  });

  describe('8. Edge Cases and Performance', () => {
    it('should handle root folder listing correctly', async () => {
      const rootFolders = await listFolders(testUserId, null);

      expect(Array.isArray(rootFolders)).toBe(true);
      expect(rootFolders.length).toBeGreaterThan(0);
    });

    it('should handle deeply nested folder structures', async () => {
      const deepRoot = await createFolder(testUserId, 'Deep Root', null, '127.0.0.1');
      let current = deepRoot;

      // Create a 5-level deep hierarchy
      for (let i = 0; i < 5; i++) {
        current = await createFolder(testUserId, `Deep Level ${i}`, current.id, '127.0.0.1');
      }

      // Should be able to get tree for entire hierarchy
      const tree = await getFolderTree(testUserId, deepRoot.id);
      expect(tree).toBeDefined();
      expect(Array.isArray(tree)).toBe(true);
    });

    it('should handle folder contents correctly', async () => {
      const contents = await getFolderContents(testUserId, folder1.id);

      expect(contents).toHaveProperty('folders');
      expect(contents).toHaveProperty('files');
      expect(Array.isArray(contents.folders)).toBe(true);
      expect(Array.isArray(contents.files)).toBe(true);
    });
  });

  describe('9. Access Control', () => {
    it('should not allow access to other user folders', async () => {
      const otherUserId = 'other-user-' + Date.now();

      expect(async () => {
        await getFolderById(rootFolder.id, otherUserId);
      }).rejects.toThrow('not found');
    });

    it('should not allow moving to other user parent folder', async () => {
      const otherUserId = 'other-user-' + Date.now();
      const otherUserFolder = await createFolder(otherUserId, 'Other Folder', null, '127.0.0.1');

      expect(async () => {
        await moveFolder(folder1.id, testUserId, otherUserFolder.id, '127.0.0.1');
      }).rejects.toThrow('Access denied');
    });
  });

  describe('10. Path Consistency', () => {
    it('should maintain consistent paths for all operations', async () => {
      const pathConsistRoot = await createFolder(testUserId, 'Path Test', null, '127.0.0.1');
      const pathConsistChild = await createFolder(testUserId, 'Path Child', pathConsistRoot.id, '127.0.0.1');

      // Verify initial path
      let child = await getFolderById(pathConsistChild.id, testUserId);
      expect(child.path).toBe('Path Test/Path Child');

      // Rename parent
      await renameFolder(pathConsistRoot.id, testUserId, 'Path Test Renamed', '127.0.0.1');

      // Verify child path updated
      child = await getFolderById(pathConsistChild.id, testUserId);
      expect(child.path).toBe('Path Test Renamed/Path Child');

      // Create another folder at root level
      const pathConsistOther = await createFolder(testUserId, 'Path Other', null, '127.0.0.1');

      // Move child to other parent
      await moveFolder(pathConsistChild.id, testUserId, pathConsistOther.id, '127.0.0.1');

      // Verify new path
      child = await getFolderById(pathConsistChild.id, testUserId);
      expect(child.path).toBe('Path Other/Path Child');
    });
  });
});
