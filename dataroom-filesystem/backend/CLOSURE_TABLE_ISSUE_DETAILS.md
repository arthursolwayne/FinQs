# Closure Table Issue - Detailed Breakdown with Examples

## The Critical Bug: Closure Table Not Updated on MOVE

### What is the Closure Table?

The closure table is a materialized view of the entire folder hierarchy. Instead of computing parent-child relationships on the fly, they're pre-computed and stored.

Example hierarchy:
```
Database: folders table
├── A (Root)
│   ├── B (Child of A)
│   │   └── C (Child of B)
│   └── D (Child of A)
└── E (Root)
    └── F (Child of E)
```

Closure table stores all ancestor-descendant relationships:
```
┌───────────┬─────────────┬───────┐
│ ancestor  │ descendant  │ depth │
├───────────┼─────────────┼───────┤
│ A         │ A           │ 0     │ (self)
│ A         │ B           │ 1     │ (A → B)
│ A         │ C           │ 2     │ (A → B → C)
│ A         │ D           │ 1     │ (A → D)
│ B         │ B           │ 0     │ (self)
│ B         │ C           │ 1     │ (B → C)
│ C         │ C           │ 0     │ (self)
│ D         │ D           │ 0     │ (self)
│ E         │ E           │ 0     │ (self)
│ E         │ F           │ 1     │ (E → F)
│ F         │ F           │ 0     │ (self)
└───────────┴─────────────┴───────┘
```

### Current Implementation

**File:** `src/db/schema.sql` lines 114-138

```sql
-- Trigger function
CREATE OR REPLACE FUNCTION update_folder_closure()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Step 1: Insert self-reference (depth 0)
        INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
        VALUES (NEW.id, NEW.id, 0);

        -- Step 2: If has parent, insert ancestor paths
        IF NEW.parent_id IS NOT NULL THEN
            INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
            SELECT ancestor_id, NEW.id, depth + 1
            FROM folder_closure
            WHERE descendant_id = NEW.parent_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger activation (only on INSERT!)
CREATE TRIGGER trigger_folder_closure
AFTER INSERT ON folders
FOR EACH ROW
EXECUTE FUNCTION update_folder_closure();
```

**Problem:** Trigger only handles INSERT. When UPDATE happens (moving folder's parent_id), trigger doesn't fire.

### The Bug Scenario

#### Scenario 1: Move Folder Then Try to Delete

**Step 1: Initial State**
```
folders table:
├── A (id: uuid-a)
│   ├── B (id: uuid-b, parent_id: uuid-a)
│   │   └── C (id: uuid-c, parent_id: uuid-b)
│   └── D (id: uuid-d, parent_id: uuid-a)
└── E (id: uuid-e)

closure table:
A→A(0), A→B(1), A→C(2), A→D(1)
B→B(0), B→C(1)
C→C(0)
D→D(0)
E→E(0)
```

**Step 2: Move B under E**
```
Code execution (src/services/folderService.js:374-459):

// ✓ Check: Is E descendant of B? No. (Passes)
SELECT 1 FROM folder_closure
WHERE ancestor_id = 'uuid-b' AND descendant_id = 'uuid-e'
-- Returns: 0 rows ✓

// ✓ Update parent and path
UPDATE folders
SET parent_id = 'uuid-e', path = 'E/B'
WHERE id = 'uuid-b'

// ✓ Update descendants' paths
UPDATE folders
SET path = REPLACE(path, 'A/B', 'E/B')
WHERE path LIKE 'A/B/%'
```

**After Move:**
```
folders table (UPDATED ✓):
├── A (id: uuid-a)
│   └── D (id: uuid-d, parent_id: uuid-a)
└── E (id: uuid-e)
    └── B (id: uuid-b, parent_id: uuid-e)  ← MOVED
        └── C (id: uuid-c, parent_id: uuid-b)  ← parent_id unchanged

closure table (NOT UPDATED ✗):
Still has:
A→A(0), A→B(1), A→C(2), A→D(1)  ← WRONG!
B→B(0), B→C(1)
C→C(0)
D→D(0)
E→E(0)

Should have:
A→A(0), A→D(1)
B→B(0), B→C(1)
C→C(0)
D→D(0)
E→E(0), E→B(1), E→C(2)  ← MISSING
```

**Step 3: Delete A (the original parent)**
```
Code execution (src/services/folderService.js:326-335):

// Find all descendants of A
SELECT descendant_id FROM folder_closure
WHERE ancestor_id = 'uuid-a'
-- Returns: uuid-a, uuid-b, uuid-c, uuid-d  ← WRONG! B and C were moved!

// Delete all of them
UPDATE folders SET is_deleted = TRUE
WHERE id IN ('uuid-a', 'uuid-b', 'uuid-c', 'uuid-d')

Result:
✓ A deleted (correct)
✓ D deleted (correct)
✗ B deleted (WRONG! It was moved to E)
✗ C deleted (WRONG! It was moved to E)
```

**Final State:**
```
User expects:
├── E
│   └── B
│       └── C

Actual state (B and C marked deleted):
├── E
│   └── B [DELETED ✗]
│       └── C [DELETED ✗]

User loses access to entire B/C subtree!
```

#### Scenario 2: Move Folder Then Move Again

**Step 1: Create hierarchy**
```
A → B → C
```

**Step 2: Move B to D**
```
├── A
├── B (moved to root, now parent_id = NULL)
│   └── C
└── D

closure table becomes stale:
A→B(1) still exists (but shouldn't)
```

**Step 3: Try to move A to C**
```
Circular reference check:
Is C descendant of A?
SELECT 1 FROM folder_closure
WHERE ancestor_id = 'uuid-a' AND descendant_id = 'uuid-c'
-- Returns: 1 row! (A→C still in table from before move)
-- Correctly rejects ✓

But if we had tried to move A to B:
Is B descendant of A?
SELECT 1 FROM folder_closure
WHERE ancestor_id = 'uuid-a' AND descendant_id = 'uuid-b'
-- Still returns: 1 row
-- Correctly rejects ✓

This check still works by accident!
```

**Step 4: Real problem - Move B to A (who was parent before)**
```
Before: A → B → C (stale closure shows this)
After: A (moved), B → A (parent_id = 'uuid-a')
            └── C

Circular reference check (before move):
Is A descendant of B?
SELECT 1 FROM folder_closure
WHERE ancestor_id = 'uuid-b' AND descendant_id = 'uuid-a'
-- Returns: 0 rows (correct, no relationship)
-- Allows move ✓

But now:
A → B → A → B → ... (CIRCULAR REFERENCE!)
```

### Code Evidence

**folderService.js - moveFolder function (lines 374-459):**

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

    // ✓ Circular reference check
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

    // ✗ UPDATE parent_id AND path - NO CLOSURE TABLE UPDATE
    await client.query(
      'UPDATE folders SET parent_id = $1, path = $2, updated_at = NOW() WHERE id = $3',
      [newParentId, newPath, folderId]  // LINE 425
    );

    // ✗ NO UPDATE TO folder_closure TABLE
    // ✗ NO DELETE FROM folder_closure WHERE ...
    // ✗ NO INSERT INTO folder_closure ...

    // Update descendant paths (fragile)
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

**The fix would require:**

```javascript
// After updating parent_id and path, must update closure table

// 1. Find all descendants of the folder being moved
const descendants = await client.query(
  'SELECT descendant_id, depth FROM folder_closure WHERE ancestor_id = $1',
  [folderId]
);

// 2. Delete old ancestor relationships (except self-references)
await client.query(
  `DELETE FROM folder_closure
   WHERE descendant_id IN (
     SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1
   )
   AND ancestor_id != descendant_id
   AND ancestor_id NOT IN (
     SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1
   )`,
  [folderId]
);

// 3. Insert new ancestor relationships
// For each ancestor of new parent, add path through new parent
await client.query(
  `INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
   SELECT fc.ancestor_id, d.descendant_id, fc.depth + d.depth + 1
   FROM folder_closure fc
   JOIN folder_closure d ON d.ancestor_id = $1
   WHERE fc.descendant_id = $2
     AND d.depth > 0
   ON CONFLICT DO NOTHING`,
  [folderId, newParentId]
);
```

---

## Impact Analysis

### Direct Impact - Functions Broken After First Move

| Function | Impact | Severity |
|----------|--------|----------|
| `deleteFolder()` | Uses closure table to find descendants, deletes wrong folders | CRITICAL |
| `getFolderTree()` | Uses recursive CTE on folders table (not closure), still works | LOW |
| `getBreadcrumbs()` | Uses recursive CTE on folders table, still works | LOW |
| `moveFolder()` (second move) | Closure table is stale, circular check may fail | MEDIUM |
| `listFolders()` | Not affected | NONE |

### Cascading Effects

```
Move operation
    ↓
Closure table becomes inconsistent
    ↓
DELETE operation reads stale closure table
    ↓
Wrong folders marked as deleted
    ↓
DATA LOSS
    ↓
User data integrity compromised
```

### Timeline

```
Time    Event                               Closure Table Status
────    ─────────────────────────────       ────────────────────
0       System initialized                  CORRECT ✓
        Create A, B (child of A)

1       First move: Move B to root          INCONSISTENT ✗
        └─ parent_id updated, closure NOT

2       Delete A                            WRONG RESULT ✗
        └─ Uses stale closure table
        └─ Deletes B even though B moved
        └─ Data loss
```

---

## Why This Bug Exists

### Root Cause Analysis

1. **Incomplete implementation of closure table pattern**
   - Pattern requires UPDATE/DELETE handlers
   - Implementation only has INSERT handler

2. **Misunderstanding of trigger scope**
   - Trigger only fires on INSERT
   - Doesn't listen to UPDATE events on parent_id

3. **Lack of comprehensive testing**
   - Existing tests don't verify closure table state
   - Tests don't check move + delete sequences
   - Tests don't validate closure table consistency

4. **Over-reliance on single pattern**
   - Code uses closure table for some queries (delete)
   - Uses recursive CTE for others (tree)
   - Mixed approaches create inconsistency

---

## Fix Strategy

### Option 1: Maintain Closure Table in Application Code (RECOMMENDED)

Handle all closure table updates in `folderService.js` within transactions:

```javascript
async function moveFolder(folderId, userId, newParentId, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Existing validation code...

    // Update parent_id and path
    await client.query(
      'UPDATE folders SET parent_id = $1, path = $2 WHERE id = $3',
      [newParentId, newPath, folderId]
    );

    // NEW: Update closure table
    await updateClosureTableForMove(client, folderId, newParentId);

    // Existing audit log...

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateClosureTableForMove(client, folderId, newParentId) {
  // Get all descendants of folderId
  const descendants = await client.query(
    'SELECT descendant_id, depth FROM folder_closure WHERE ancestor_id = $1',
    [folderId]
  );

  // Delete all old ancestor-descendant relationships
  // (except self-references and relationships within the moved subtree)
  await client.query(
    `DELETE FROM folder_closure
     WHERE descendant_id IN (
       SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1
     )
     AND ancestor_id NOT IN (
       SELECT descendant_id FROM folder_closure WHERE ancestor_id = $1
     )`,
    [folderId]
  );

  // Insert new paths from ancestors of new parent to all descendants of folder
  if (newParentId) {
    await client.query(
      `INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
       SELECT fc.ancestor_id, d.descendant_id, fc.depth + d.depth + 1
       FROM folder_closure fc
       JOIN folder_closure d
       WHERE fc.descendant_id = $1
         AND d.ancestor_id = $2
         AND d.depth > 0
       ON CONFLICT DO NOTHING`,
      [newParentId, folderId]
    );
  }
}
```

### Option 2: Use Database Triggers for UPDATE

Add UPDATE trigger to schema.sql:

```sql
CREATE OR REPLACE FUNCTION update_folder_closure_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    -- Handle parent_id change (move operation)
    -- Delete old relationships, insert new ones
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_folder_closure_update
AFTER UPDATE ON folders
FOR EACH ROW
EXECUTE FUNCTION update_folder_closure_on_update();
```

**Issue:** Complex trigger logic, harder to test, less visible in application code.

### Option 3: Stop Using Closure Table for Moves

Use only recursive CTE for all queries:

```javascript
// Use this for all queries instead of closure table
async function getDescendants(folderId) {
  const result = await query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f
       INNER JOIN descendants d ON f.parent_id = d.id
     )
     SELECT id FROM descendants`,
    [folderId]
  );
  return result.rows;
}
```

**Issue:** Recursive CTE slower for large trees, defeats purpose of closure table.

### Recommendation

**Use Option 1:** Application-level maintenance with proper transaction handling.

**Reasons:**
- Explicit control over closure table consistency
- Easier to test and debug
- Clear audit trail in code
- Can add validation and error handling

---

## Testing Strategy

### Test Case 1: Verify Closure Table After Move

```javascript
it('should maintain closure table consistency after move', async () => {
  // Create A → B → C
  // Move B under D
  // Verify closure table:
  //   - Remove A→B relationship
  //   - Remove A→C relationship
  //   - Add D→B relationship
  //   - Add D→C relationship
});
```

### Test Case 2: Move Then Delete Integrity

```javascript
it('should delete correct folders after previous move', async () => {
  // Create A → B → C
  // Move B under D
  // Delete A
  // Verify: Only A is deleted, B and C remain under D
});
```

### Test Case 3: Circular Reference Prevention

```javascript
it('should prevent circular references even after multiple moves', async () => {
  // Create A → B → C
  // Move B under C (should fail)
  // Move C under B (should fail)
  // Move A under C (should fail)
});
```

### Test Case 4: Deep Nesting

```javascript
it('should handle deeply nested structures', async () => {
  // Create 15-level deep structure
  // Tree generation should work without depth limit
  // Moves should work correctly
});
```

---

## Verification Checklist

- [ ] Closure table updated on folder move
- [ ] Closure table correctly reflects new ancestor relationships
- [ ] Delete uses correct descendants after move
- [ ] Circular reference check works after move
- [ ] Path consistency maintained after move
- [ ] Transactions rollback properly on error
- [ ] No stale entries in closure table
- [ ] Works with soft deletes
- [ ] Works with rename operations
- [ ] All existing tests pass
- [ ] New comprehensive tests pass

