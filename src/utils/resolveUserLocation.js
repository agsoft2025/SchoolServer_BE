const UserSchema = require("../model/userModel");

const MAX_LOCATION_DEPTH = 5;

const resolveLocationIdForDoc = async (userDoc, depth = 0, visited = new Set()) => {
  if (!userDoc || depth >= MAX_LOCATION_DEPTH) return null;
  if (userDoc.location_id) return userDoc.location_id;

  const parentId = userDoc.created_by;
  if (!parentId) return null;

  const parentKey = parentId.toString();
  if (visited.has(parentKey)) return null;

  visited.add(parentKey);
  const parentDoc = await UserSchema.findById(parentId)
    .select("location_id created_by")
    .lean();
  return resolveLocationIdForDoc(parentDoc, depth + 1, visited);
};

const resolveLocationIdById = async (userId) => {
  if (!userId) return null;
  const userDoc = await UserSchema.findById(userId)
    .select("location_id created_by")
    .lean();
  return resolveLocationIdForDoc(userDoc);
};

module.exports = {
  resolveLocationIdForDoc,
  resolveLocationIdById,
};
