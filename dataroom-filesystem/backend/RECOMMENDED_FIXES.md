# Recommended Fixes for Folder Hierarchy System

**Priority:** Before production deployment
**Estimated effort:** 6-8 hours including testing
**Risk if not fixed:** Data loss from unexpected deletions

---

## Fix #1: Update moveFolder() to Maintain Closure Table (CRITICAL)

### Current Code (BROKEN)
**File:** `src/services/folderService.js` lines 374-459

```javascript
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

    // Circular reference check
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

    // ❌ MISSING: closure table not updated!

    // Update descendant paths
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
```

### Fixed Code (RECOMMENDED)

```javascript
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

    // Circular reference check
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

    // ✅ NEW: Update closure table to maintain consistency
    await updateClosureTableForMove(client, folderId, newParentId);

    // Update descendant paths
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

/**
 * Update closure table when folder is moved
 * Maintains ancestor-descendant relationships
 */
async function updateClosureTableForMove(client, folderId, newParentId) {
  try {
    // Step 1: Get all descendants of the folder being moved
    const descendants = await client.query(
      'SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1 AND depth > 0',
      [folderId]
    );

    if (descendants.rows.length === 0) {
      // No descendants, only need to update self
      return;
    }

    const descendantIds = descendants.rows.map(r => r.descendant_id);

    // Step 2: Delete old ancestor relationships
    // Remove paths from old ancestors to this folder's descendants
    // But keep relationships within the moved subtree
    await client.query(
      `DELETE FROM folder_closure
       WHERE descendant_id = ANY($1::uuid[])
       AND ancestor_id NOT IN (
         SELECT descendant_id FROM folder_closure WHERE ancestor_id = $2
       )`,
      [descendantIds, folderId]
    );

    // Step 3: Insert new ancestor relationships
    // Add paths from new parent's ancestors to this folder's descendants
    if (newParentId) {
      await client.query(
        `INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
         SELECT fc.ancestor_id, d.descendant_id, fc.depth + d.depth + 1
         FROM folder_closure fc
         JOIN folder_closure d ON d.ancestor_id = $1
         WHERE fc.descendant_id = $2
           AND d.depth > 0
         ON CONFLICT (ancestor_id, descendant_id) DO NOTHING`,
        [folderId, newParentId]
      );
    }
  } catch (error) {
    console.error('Error updating closure table for move:', error);
    throw error;
  }
}

// Export the new helper function
module.exports = {
  // ... existing exports ...
  updateClosureTableForMove,  // Add this for testability
};
```

### Testing the Fix

```javascript
// Test case to verify fix works
describe('moveFolder with closure table updates', () => {
  it('should maintain closure table consistency after move', async () => {
    // Create: A → B → C, D
    const A = await createFolder(userId, 'A', null, '127.0.0.1');
    const B = await createFolder(userId, 'B', A.id, '127.0.0.1');
    const C = await createFolder(userId, 'C', B.id, '127.0.0.1');
    const D = await createFolder(userId, 'D', null, '127.0.0.1');

    // Move B under D
    await moveFolder(B.id, userId, D.id, '127.0.0.1');

    // Verify closure table
    // Should have:
    // D→D(0), D→B(1), D→C(2)
    // Should NOT have:
    // A→B, A→C

    const DBEntry = await query(
      'SELECT depth FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
      [D.id, B.id]
    );
    expect(DBEntry.rows[0].depth).toBe(1);

    const DCEntry = await query(
      'SELECT depth FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
      [D.id, C.id]
    );
    expect(DCEntry.rows[0].depth).toBe(2);

    // Verify old relationships removed
    const ABEntry = await query(
      'SELECT * FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
      [A.id, B.id]
    );
    expect(ABEntry.rows.length).toBe(0);
  });

  it('should allow delete after move without deleting wrong folders', async () => {
    // Create and move as above
    // ...

    // Delete A
    const result = await deleteFolder(A.id, userId, '127.0.0.1');
    expect(result.success).toBe(true);

    // Verify A is deleted, B and C are not
    const ACheck = await query(
      'SELECT is_deleted FROM folders WHERE id = $1',
      [A.id]
    );
    expect(ACheck.rows[0].is_deleted).toBe(true);

    const BCheck = await query(
      'SELECT is_deleted FROM folders WHERE id = $1',
      [B.id]
    );
    expect(BCheck.rows[0].is_deleted).toBe(false);

    const CCheck = await query(
      'SELECT is_deleted FROM folders WHERE id = $1',
      [C.id]
    );
    expect(CCheck.rows[0].is_deleted).toBe(false);
  });
});
```

---

## Fix #2: Remove or Document Depth Limit (HIGH)

### Current Code (LIMITED)
**File:** `src/services/folderService.js` line 169

```javascript
WITH RECURSIVE folder_tree AS (
  -- ...
  WHERE f.is_deleted = FALSE AND ft.depth < 10  // ← Hard limit
)
```

### Option A: Remove the Limit (RECOMMENDED)

```javascript
WITH RECURSIVE folder_tree AS (
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
  WHERE f.is_deleted = FALSE
  -- No depth limit - removed ft.depth < 10
)
```

### Option B: Increase and Document the Limit

```javascript
WITH RECURSIVE folder_tree AS (
  -- ... base case ...
  UNION ALL
  -- Recursive case: child folders
  SELECT f.id, f.user_id, f.parent_id, f.name, f.path, ft.depth + 1
  FROM folders f
  INNER JOIN folder_tree ft ON f.parent_id = ft.id
  WHERE f.is_deleted = FALSE AND ft.depth < 100  -- Increased to 100 levels
)
```

Also add documentation to API:
```javascript
/**
 * GET /api/folders/:id/tree
 * Get folder tree structure (hierarchical listing)
 *
 * @param {string} id - Folder ID or 'root' for root folders
 * @returns {object} { tree: FolderNode[] }
 *
 * @note Tree depth is limited to 100 levels. Deeply nested folders
 *       beyond this limit will not be included in the result.
 */
router.get('/:id/tree', requireAuth, async (req, res) => {
  // ...
});
```

---

## Fix #3: Add Duplicate Name Check to renameFolder() (HIGH)

### Current Code (UNSAFE)
**File:** `src/services/folderService.js` lines 237-302

```javascript
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

    // ❌ MISSING: Check for duplicate name at same level

    // Update folder
    await client.query(
      'UPDATE folders SET name = $1, path = $2, updated_at = NOW() WHERE id = $3',
      [sanitizedName, newPath, folderId]
    );

    // ... rest of function ...
  }
}
```

### Fixed Code (SAFE)

```javascript
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

    // ✅ NEW: Check for duplicate name at same level
    const existingFolder = await client.query(
      'SELECT id FROM folders WHERE user_id = $1 AND path = $2 AND is_deleted = FALSE AND id != $3',
      [userId, newPath, folderId]
    );

    if (existingFolder.rows.length > 0) {
      throw new Error('Folder with this name already exists in this location');
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
```

---

## Fix #4: Improve Path Updates to Use Closure Table (MEDIUM)

This is more complex but more robust. Currently skipped if Fix #1 is implemented successfully.

### Consider for Future

Instead of using REPLACE:
```javascript
// Current (fragile):
UPDATE folders SET path = REPLACE(path, $1, $2)
WHERE path LIKE $3

// Future (robust):
// 1. Get exact descendants from closure table
// 2. Update each individually OR reconstruct paths
```

---

## Implementation Plan

### Phase 1: Critical Fixes (6 hours)

**Hour 1-2:**
- Implement `updateClosureTableForMove()` helper function
- Add call to new helper in `moveFolder()`
- Write unit tests for closure table updates

**Hour 3-4:**
- Test comprehensive move scenarios
- Test delete after move
- Test circular reference prevention

**Hour 5-6:**
- Test depth limit removal/increase
- Run full test suite
- Verify no regressions

### Phase 2: High Priority Fixes (2 hours)

**Hour 1:**
- Add duplicate name check to `renameFolder()`
- Test rename operations

**Hour 2:**
- Full regression testing
- Document changes

---

## Validation Checklist

After implementing fixes, verify:

```
[ ] Closure table created correctly on folder create
[ ] Closure table updated correctly on folder move
[ ] Old ancestor relationships removed on move
[ ] New ancestor relationships created on move
[ ] Delete uses correct descendants after move
[ ] Circular reference prevention works after move
[ ] Depth limit removed or documented
[ ] Duplicate names rejected in rename
[ ] All existing tests pass
[ ] All new tests pass
[ ] Manual testing with complex hierarchies
[ ] Load testing with large folders
```

---

## Rollback Plan

If issues discovered in production:

1. Stop accepting move requests (return error)
2. Recover from backup if data was lost
3. Run diagnostic query to check closure table consistency:

```sql
-- Check for orphaned descendants (wrong ancestors)
SELECT
  fc.ancestor_id,
  fc.descendant_id,
  (SELECT name FROM folders WHERE id = fc.ancestor_id) as ancestor_name,
  (SELECT name FROM folders WHERE id = fc.descendant_id) as descendant_name,
  fc.depth
FROM folder_closure fc
WHERE fc.ancestor_id NOT IN (
  -- Get all actual ancestors of descendant
  WITH RECURSIVE ancestors AS (
    SELECT parent_id FROM folders WHERE id = fc.descendant_id
    UNION ALL
    SELECT f.parent_id FROM folders f
    INNER JOIN ancestors a ON f.id = a.parent_id
  )
  SELECT DISTINCT parent_id FROM ancestors
  UNION ALL
  SELECT fc.descendant_id  -- Include self
)
AND fc.descendant_id != fc.ancestor_id;
```

---

## Success Criteria

System is production-ready when:

1. **Data Integrity:** No data loss on move + delete sequences
2. **Consistency:** Closure table always matches actual hierarchy
3. **Reliability:** All move operations complete successfully
4. **Safety:** Circular references reliably prevented
5. **Performance:** No regression in query times
6. **Testing:** 100% of new test cases pass

