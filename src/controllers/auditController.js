const AuditLog = require('../model/auditLogModel');
const { requireUserLocation } = require('../utils/locationGuard');

const getAuditLogs = async (req, res) => {
  try {
    const { userId, action, fromDate, toDate, page = 1, limit = 20, location_id } = req.query;

    const filter = {};

    if (userId) {
      filter.userId = userId;
    }

    if (action) {
      filter.action = action;
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    if (req.user.role !== 'SUPER ADMIN') {
      const locationId = requireUserLocation(req, res);
      if (!locationId) return;
      filter.location_id = locationId;
    } else if (location_id) {
      filter.location_id = location_id;
    }

    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    const totalLogs = await AuditLog.countDocuments(filter);

    const logs = await AuditLog.find(filter)
      .populate('userId', 'username fullName')
      .populate('location_id', 'locationName schoolName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    const sanitizedLogs = logs; // Keeping changes for frontend

    res.status(200).json({
      success: true,
      data: sanitizedLogs,
      pagination: {
        total: totalLogs,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalLogs / pageSize)
      },
      message: 'Audit logs fetched successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

module.exports = { getAuditLogs };
