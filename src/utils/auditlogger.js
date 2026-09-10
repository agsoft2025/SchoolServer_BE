// src/utils/auditLogger.js
const AuditLog = require('../model/auditLogModel');
const UserSchema = require('../model/userModel');
const { resolveLocationIdForDoc } = require('./resolveUserLocation');

const logAudit = async ({ userId, username, action, targetModel, targetId, description, changes, actorRole, location_id }) => {
  try {
    let resolvedLocation = location_id;
    let resolvedRole = actorRole;

    if (userId) {
      const userDoc = await UserSchema.findById(userId).select('role location_id created_by').lean();
      if (userDoc) {
        resolvedRole = resolvedRole || userDoc.role;
        resolvedLocation = resolvedLocation || await resolveLocationIdForDoc(userDoc);
      }
    }

    await AuditLog.create({
      userId,
      username,
      action,
      targetModel,
      targetId,
      description,
      changes,
      actorRole: resolvedRole,
      location_id: resolvedLocation
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
};

module.exports = logAudit;
