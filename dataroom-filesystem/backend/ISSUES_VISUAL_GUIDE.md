# Folder Hierarchy Issues - Visual Guide

## Issue Overview Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│             FOLDER HIERARCHY SYSTEM STATUS                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Overall Status: ❌ NOT PRODUCTION READY                    │
│                                                              │
│  Critical Issues:  3 (MUST FIX)                            │
│  High Issues:      3 (SHOULD FIX)                          │
│  Medium Issues:    2 (NICE TO HAVE)                        │
│                                                              │
│  Data Loss Risk:   🔴 CRITICAL                             │
│  Circular Ref Bug: ⚠️ HIGH                                 │
│  Performance:      🟡 ACCEPTABLE (with limits)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Issue Map

### Issue #1: CLOSURE TABLE NOT UPDATED ON MOVE (CRITICAL)

```
SYMPTOM: System behavior changes unexpectedly after moving folders

File:     src/services/folderService.js
Lines:    374-459 (moveFolder function)
Severity: CRITICAL - Can cause data loss

┌─────────────────────────────────────────────────────────┐
│ WHAT HAPPENS NOW (BROKEN):                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  const folder = { id: B, path: 'A/B' }                 │
│  const newParent = { id: D }                           │
│                                                          │
│  // ✓ Check if D is descendant of B (WORKS)            │
│  SELECT * FROM folder_closure                          │
│  WHERE ancestor_id = B AND descendant_id = D           │
│  -- Returns: empty (D is not descendant)               │
│                                                          │
│  // ✓ Update parent_id and path (WORKS)                │
│  UPDATE folders SET parent_id = D, path = 'D/B'        │
│  WHERE id = B                                           │
│                                                          │
│  // Update descendant paths (WORKS for paths)           │
│  UPDATE folders SET path = REPLACE(path, 'A/B', 'D/B') │
│                                                          │
│  // ❌ NO CLOSURE TABLE UPDATE (BROKEN!)               │
│  -- folder_closure still has: A→B, A→C                │
│  -- folder_closure missing: D→B, D→C                   │
│                                                          │
│  RESULT: Closure table is now INCONSISTENT! 💥          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Root Cause:**
```javascript
// Line 425 in moveFolder()
await client.query(
  'UPDATE folders SET parent_id = $1, path = $2, updated_at = NOW() WHERE id = $3',
  [newParentId, newPath, folderId]
);

// MISSING: Update to folder_closure table
// MISSING: DELETE old ancestor relationships
// MISSING: INSERT new ancestor relationships
```

**Consequence Chain:**
```
Move B under D
    ↓
Closure table becomes stale
    ↓
Delete A (original parent)
    ↓
deleteFolder() queries: "SELECT descendants FROM folder_closure WHERE ancestor = A"
    ↓
Gets: [A, B, C] (WRONG! B and C are under D now)
    ↓
Marks B and C as deleted
    ↓
User loses access to B and C
    ↓
DATA LOSS! 🔴
```

---

### Issue #2: TRIGGER INCOMPLETE - INSERT ONLY (CRITICAL)

```
File:     src/db/schema.sql
Lines:    114-138
Severity: CRITICAL - Missing UPDATE handler

┌──────────────────────────────────────────────────────────┐
│ CURRENT TRIGGER DEFINITION (INCOMPLETE):                 │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  CREATE TRIGGER trigger_folder_closure                  │
│  AFTER INSERT ON folders                    ← INSERT ONLY
│  FOR EACH ROW                                │
│  EXECUTE FUNCTION update_folder_closure();  └─ Missing UPDATE!
│                                                           │
│ HOW IT WORKS:                                            │
│   • New folder created → Trigger fires ✓                 │
│   • Closure table entries inserted ✓                     │
│   • Folder moved (UPDATE parent_id) → Trigger DOESN'T    │
│     fire ✗                                               │
│   • Closure table NOT updated ✗                          │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**What's Missing:**
```sql
-- Should exist but doesn't:
CREATE TRIGGER trigger_folder_closure_on_update
AFTER UPDATE ON folders
FOR EACH ROW
WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
EXECUTE FUNCTION update_folder_closure_on_update();

-- Or handle in application code (RECOMMENDED)
```

---

### Issue #3: DELETE USES STALE CLOSURE DATA (CRITICAL)

```
File:     src/services/folderService.js
Lines:    326-347 (deleteFolder function)
Severity: CRITICAL - Wrong data deleted

┌──────────────────────────────────────────────────────────┐
│ HOW STALE DATA CAUSES WRONG DELETES:                     │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ Initial State:                                            │
│   A → B → C                                              │
│   Closure table: A→A(0), A→B(1), A→C(2),               │
│                  B→B(0), B→C(1), C→C(0)                │
│                                                           │
│ Operation 1: Move B under D                             │
│   A . .        D                                         │
│            → B → C                                       │
│   Closure table: UNCHANGED (stale!)                      │
│                  Still has A→B, A→C                    │
│                                                           │
│ Operation 2: Delete A                                   │
│   deleteFolder(A, userId) executes:                     │
│                                                           │
│   UPDATE folders SET is_deleted = TRUE                  │
│   WHERE id IN (                                          │
│     SELECT descendant_id FROM folder_closure            │
│     WHERE ancestor_id = A                               │
│   )                                                      │
│                                                           │
│   Gets: [A, B, C] ← WRONG!                             │
│   ✓ Deletes A (correct)                                 │
│   ✗ Deletes B (WRONG - it's under D)                   │
│   ✗ Deletes C (WRONG - it's under D via B)            │
│                                                           │
│ RESULT: User loses B and C unexpectedly! 🔴             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Code Location:**
```javascript
// src/services/folderService.js, lines 326-335
await client.query(
  `UPDATE folders
   SET is_deleted = TRUE, deleted_at = NOW()
   WHERE id IN (
     SELECT descendant_id
     FROM folder_closure              ← STALE DATA!
     WHERE ancestor_id = $1
   ) AND user_id = $2`,
  [folderId, userId]
);

// Same issue for files (lines 338-347)
```

---

### Issue #4: FRAGILE PATH UPDATES (HIGH)

```
File:     src/services/folderService.js
Lines:    272-279 (renameFolder), 430-436 (moveFolder)
Severity: HIGH - Can corrupt similar folder names

┌──────────────────────────────────────────────────────────┐
│ PROBLEM WITH STRING-BASED PATH UPDATES:                  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ SCENARIO 1: Similar folder names (DANGER)                │
│   Folders:     Root/Doc, Root/Doc_backup                │
│   Action:      Rename Doc to Documents                  │
│   Query:       REPLACE(path, 'Root/Doc', 'Root/Documents')
│   Result:      Root/Documents/Documents_backup 💥       │
│                                                           │
│ SCENARIO 2: Special characters (DANGER)                  │
│   Folder:      Root/Doc[Test]                            │
│   Pattern:     Root/Doc[Test]/%  ← REGEX CHARS!         │
│   Query:       WHERE path LIKE 'Root/Doc[Test]/%'       │
│   Result:      [] - Pattern treated as regex            │
│                                                           │
│ SCENARIO 3: Concurrent updates (DANGER)                  │
│   Thread 1:    Move A to B                              │
│   Thread 2:    Rename A to A2                           │
│   Result:      Path corruption due to race              │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Code Pattern:**
```javascript
// Lines 272-279 in renameFolder()
await client.query(
  `UPDATE folders
   SET path = REPLACE(path, $1, $2),    ← FRAGILE!
       updated_at = NOW()
   WHERE path LIKE $3                    ← FRAGILE!
     AND user_id = $4`,
  [folder.path, newPath, `${folder.path}/%`, userId]
);

// Same in moveFolder() lines 430-436
```

---

### Issue #5: NO DUPLICATE NAME CHECK (HIGH)

```
File:     src/services/folderService.js
Lines:    237-302 (renameFolder function)
Severity: HIGH - Creates inconsistent state

┌──────────────────────────────────────────────────────────┐
│ CREATEFOLDER() HAS CHECK:                                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ const existingFolder = await client.query(               │
│   'SELECT id FROM folders                               │
│    WHERE user_id = $1 AND path = $2 AND is_deleted = FALSE',
│   [userId, folderPath]                                  │
│ );                                                       │
│                                                           │
│ if (existingFolder.rows.length > 0) {                   │
│   throw new Error('Folder with this name already exists');│
│ }                                                        │
│                                                           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ RENAMEFOLDER() MISSING CHECK:                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ // No check for duplicate name!                         │
│ // Just directly updates:                               │
│                                                           │
│ await client.query(                                      │
│   'UPDATE folders SET name = $1, path = $2 WHERE id = $3',
│   [sanitizedName, newPath, folderId]                    │
│ );                                                       │
│                                                           │
│ RESULT: Can create duplicate folder names!               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Missing Code:**
```javascript
// Should add this check in renameFolder() before update:
const existingFolder = await client.query(
  `SELECT id FROM folders
   WHERE user_id = $1 AND path = $2 AND is_deleted = FALSE`,
  [userId, newPath]
);

if (existingFolder.rows.length > 0) {
  throw new Error('Folder with this name already exists in this location');
}
```

---

### Issue #6: DEPTH LIMIT NOT DOCUMENTED (MEDIUM)

```
File:     src/services/folderService.js
Line:     169 (in getFolderTree function)
Severity: MEDIUM - Silent failure for deep trees

┌──────────────────────────────────────────────────────────┐
│ RECURSIVE CTE HAS HARD LIMIT:                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ WITH RECURSIVE folder_tree AS (                          │
│   SELECT ... FROM folders                               │
│   UNION ALL                                             │
│   SELECT ... FROM folders f                             │
│   INNER JOIN folder_tree ft ON f.parent_id = ft.id      │
│   WHERE f.is_deleted = FALSE AND ft.depth < 10  ← LIMIT!
│ )                                                        │
│                                                           │
│ WHAT THIS MEANS:                                         │
│   • Trees with 10+ levels are truncated                  │
│   • No error message to client                           │
│   • No documentation in API                              │
│   • Client doesn't know tree is incomplete               │
│                                                           │
│ EXAMPLE:                                                 │
│   Actual tree: A > B > C > D > E > F > G > H > I > J > K │
│   Returned:    A > B > C > D > E > F > G > H > I > J      │
│   Missing:     K (silently truncated)                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Issue Impact Matrix

```
┌────────────┬──────────────┬────────────┬──────────────┐
│ Issue      │ Severity     │ Affects    │ Data Loss    │
├────────────┼──────────────┼────────────┼──────────────┤
│ #1 (Move)  │ CRITICAL     │ Delete     │ YES ❌       │
│ #2 (Trig)  │ CRITICAL     │ Move       │ YES ❌       │
│ #3 (Delete)│ CRITICAL     │ Move+Del   │ YES ❌       │
│ #4 (Path)  │ HIGH         │ Rename/Mov │ Maybe ⚠️    │
│ #5 (Dup)   │ HIGH         │ Rename     │ No 🟡       │
│ #6 (Deep)  │ MEDIUM       │ Tree       │ No 🟡       │
└────────────┴──────────────┴────────────┴──────────────┘
```

---

## Operational Risk Timeline

```
Timeline    Operation              Risk Level      Status
────────────────────────────────────────────────────────────
Week 1-2    System deployed        🟢 LOW         Everything works
            (fresh data)

Week 3      User moves folder      🟢 LOW         Closure table
            (A → A1)               (one move)     becomes stale

Week 4      User moves another     🟡 MEDIUM      Closure table
            folder (B → B1)        (stale growing) more stale

Week 5      User deletes parent A  🔴 CRITICAL    WRONG FOLDERS
            expecting only A       (data loss!)    DELETED
            to be deleted

Result:     Unexpected data loss   💥 DISASTER     System
            User loses trust                       untrusted
────────────────────────────────────────────────────────────
```

---

## Code Snippet Reference

### ❌ BROKEN: moveFolder() - Missing Closure Table Update

**File:** `src/services/folderService.js` (lines 374-459)

```javascript
async function moveFolder(folderId, userId, newParentId, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // ... validation code ...

    // ✓ CORRECT: Circular reference check
    if (newParentId) {
      const descendantCheck = await client.query(
        'SELECT 1 FROM folder_closure WHERE ancestor_id = $1 AND descendant_id = $2',
        [folderId, newParentId]
      );
      if (descendantCheck.rows.length > 0) {
        throw new Error('Cannot move folder to its own descendant');
      }
    }

    // ✓ CORRECT: Update parent_id and path
    await client.query(
      'UPDATE folders SET parent_id = $1, path = $2, updated_at = NOW() WHERE id = $3',
      [newParentId, newPath, folderId]  // Line 425
    );

    // ❌ MISSING: NO UPDATE TO folder_closure TABLE!
    // Should be here:
    // 1. DELETE old ancestor-descendant relationships
    // 2. INSERT new ancestor-descendant relationships

    // ✓ CORRECT: Update descendant paths (but fragile)
    await client.query(
      `UPDATE folders
       SET path = REPLACE(path, $1, $2),
           updated_at = NOW()
       WHERE path LIKE $3 AND user_id = $4`,
      [folder.path, newPath, `${folder.path}/%`, userId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### ✓ CORRECT: createFolder() - Closure Table Auto-Maintained

**File:** `src/services/folderService.js` (lines 8-79)

```javascript
async function createFolder(userId, name, parentId = null, ipAddress) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // ... validation and path building ...

    // ✓ CREATE FOLDER
    const result = await client.query(
      `INSERT INTO folders (user_id, parent_id, name, path)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, parent_id, name, path, created_at`,
      [userId, parentId, sanitizedName, folderPath]
    );

    // ✓ CLOSURE TABLE AUTOMATICALLY UPDATED by trigger!
    // Trigger adds:
    // - Self-reference (depth=0)
    // - Ancestor paths (if parent exists)

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## Quick Reference: What Works vs What Doesn't

```
┌─────────────────────────┬──────────┬─────────────────────┐
│ Operation               │ Status   │ Notes               │
├─────────────────────────┼──────────┼─────────────────────┤
│ Create folder           │ ✓ Works  │ Trigger maintains   │
│ Get folder              │ ✓ Works  │ Simple query        │
│ List folders            │ ✓ Works  │ By parent           │
│ Get folder contents     │ ✓ Works  │ Folders + files     │
│ Get folder tree         │ ⚠️ Works* │ *Max 10 levels      │
│ Get breadcrumbs         │ ✓ Works  │ Recursive OK        │
│ Rename folder           │ ⚠️ Works* │ *No dup check       │
│ Move folder             │ ❌ Broken │ Closure NOT updated │
│ Delete folder           │ ❌ Broken │ Uses stale closure  │
│ Circular ref check      │ ⚠️ Works* │ *After first move   │
└─────────────────────────┴──────────┴─────────────────────┘
```

---

## Fix Checklist

### Critical (Before Production)

```
[ ] Issue #1: Implement closure table update in moveFolder()
    - Delete old relationships
    - Insert new relationships
    - Test with multiple moves

[ ] Issue #2: Add UPDATE trigger or handle in code
    - Decide: database trigger vs application code
    - Implement chosen approach
    - Test edge cases

[ ] Issue #3: Verify delete uses correct descendants
    - After issues #1 and #2 fixed
    - Test delete after move
    - Verify no wrong folders deleted

[ ] Run comprehensive test suite
    - tests/unit/folder-hierarchy.test.js
    - All tests must pass
    - Run 3+ times for consistency
```

### High Priority (Before Production)

```
[ ] Issue #4: Improve path updates
    - Use closure table instead of REPLACE
    - Handle special characters properly

[ ] Issue #5: Add duplicate name check
    - Add to renameFolder()
    - Match createFolder() logic

[ ] Issue #6: Document or remove depth limit
    - Either remove ft.depth < 10
    - Or document in API
```

---

## Summary

| Component | Status | Risk | Action |
|-----------|--------|------|--------|
| Closure Table | ❌ Broken | CRITICAL | Implement full maintenance |
| Move Ops | ❌ Broken | CRITICAL | Fix closure + path updates |
| Delete Ops | ❌ Broken | CRITICAL | Fix after move is fixed |
| Read Ops | ✓ Working | NONE | No changes needed |
| Overall | ❌ Not Ready | CRITICAL | 6-8 hours to fix |

