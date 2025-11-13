const { query } = require('../db/database');

/**
 * Create an audit log entry
 */
async function createAuditLog({
  userId,
  action,
  resourceType,
  resourceId,
  ipAddress,
  userAgent,
  metadata = {},
}) {
  try {
    const result = await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        JSON.stringify(metadata),
      ]
    );

    return result.rows[0];
  } catch (error) {
    // Log error but don't throw - audit log failure shouldn't break main operation
    console.error('Failed to create audit log:', error);
    return null;
  }
}

/**
 * Get audit logs for a user
 */
async function getUserAuditLogs(userId, options = {}) {
  const {
    action,
    resourceType,
    limit = 100,
    offset = 0,
  } = options;

  let whereConditions = ['user_id = $1'];
  let params = [userId];
  let paramIndex = 2;

  if (action) {
    whereConditions.push(`action = $${paramIndex}`);
    params.push(action);
    paramIndex++;
  }

  if (resourceType) {
    whereConditions.push(`resource_type = $${paramIndex}`);
    params.push(resourceType);
    paramIndex++;
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT id, user_id, action, resource_type, resource_id,
            ip_address, user_agent, metadata, created_at
     FROM audit_logs
     WHERE ${whereConditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  return result.rows;
}

/**
 * Get audit logs for a specific resource
 */
async function getResourceAuditLogs(resourceType, resourceId, options = {}) {
  const {
    limit = 50,
    offset = 0,
  } = options;

  const result = await query(
    `SELECT al.*, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.resource_type = $1 AND al.resource_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3 OFFSET $4`,
    [resourceType, resourceId, limit, offset]
  );

  return result.rows;
}

module.exports = {
  createAuditLog,
  getUserAuditLogs,
  getResourceAuditLogs,
};
