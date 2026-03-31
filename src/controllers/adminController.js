const UserSchema = require("../model/userModel");
const bcrypt = require('bcrypt');
const mongoose = require("mongoose");
const logAudit = require("../utils/auditlogger");

const getAllAdmins = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortField = req.query.sortField || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    try {
        // Build filter object
        let filter = {
            role: { $in: ['ADMIN', 'SUPER ADMIN'] },
            isDeleted: { $ne: true }
        };

        // Add location filter based on user role
        if (req.user.role !== 'SUPER ADMIN') {
            filter.location_id = req.user.location_id;
        }

        // Additional filters from query params
        if (req.query.username) {
            filter.username = { $regex: req.query.username, $options: 'i' };
        }
        if (req.query.fullname) {
            filter.fullname = { $regex: req.query.fullname, $options: 'i' };
        }
        if (req.query.location_id) {
            filter.location_id = req.query.location_id;
        }
        if (req.query.subscription !== undefined) {
            filter.subscription = req.query.subscription === 'true';
        }

        const totalAdmins = await UserSchema.countDocuments(filter);

        const admins = await UserSchema.find(filter)
            .select('-password')
            .populate('location_id', 'location_name')
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit);

        if (!admins.length) {
            return res.status(404).json({ success: false, message: "No admins found", data: [] });
        }

        res.json({
            success: true,
            data: admins,
            currentPage: page,
            totalPages: Math.ceil(totalAdmins / limit),
            totalItems: totalAdmins,
            message: "Admins fetched successfully",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message,
        });
    }
};

const getAdminById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Admin ID is missing" });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid ID format" });
        }

        let filter = {
            _id: id,
            role: { $in: ['ADMIN', 'SUPER ADMIN'] },
            isDeleted: { $ne: true }
        };

        // Add location filter for non-super admins
        if (req.user.role !== 'SUPER ADMIN') {
            filter.location_id = req.user.location_id;
        }

        const admin = await UserSchema.findOne(filter)
            .select('-password')
            .populate('location_id', 'location_name');

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        res.json({ success: true, data: admin });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

const updateAdminById = async (req, res) => {
    try {
        const { username, fullname, newPassword, oldPassword, location_id } = req.body;
        const updateData = {};

        // Fetch existing admin
        let filter = {
            _id: req.params.id,
            role: { $in: ['ADMIN', 'SUPER ADMIN'] },
            isDeleted: { $ne: true }
        };

        if (req.user.role !== 'SUPER ADMIN') {
            filter.location_id = req.user.location_id;
        }

        const admin = await UserSchema.findOne(filter);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        // Handle username update
        if (username) {
            const existingUser = await UserSchema.findOne({ username });
            if (existingUser && existingUser._id.toString() !== req.params.id) {
                return res.status(409).json({ success: false, message: 'Username already exists' });
            }
            updateData.username = username;
        }

        // Handle password update
        if (newPassword) {
            if (!oldPassword) {
                return res.status(400).json({ success: false, message: 'Old password is required to set a new password' });
            }

            const isOldPasswordValid = await bcrypt.compare(oldPassword, admin.password);
            if (!isOldPasswordValid) {
                return res.status(400).json({ success: false, message: 'Old password is incorrect' });
            }

            updateData.password = await bcrypt.hash(newPassword, 10);
        }

        // Optional updates
        if (fullname) updateData.fullname = fullname;
        if (location_id && req.user.role === 'SUPER ADMIN') {
            updateData.location_id = location_id;
        }

        // Update admin
        const updatedAdmin = await UserSchema.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password').populate('location_id', 'location_name');

        // Audit log
        await logAudit({
            userId: req.user.id,
            username: req.user.username,
            action: 'UPDATE',
            targetModel: 'User',
            targetId: updatedAdmin._id,
            description: `Updated admin "${updatedAdmin.username}"`,
            changes: updateData
        });

        res.json({ success: true, data: updatedAdmin, message: 'Admin updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

const deleteAdminById = async (req, res) => {
    try {
        let filter = {
            _id: req.params.id,
            role: { $in: ['ADMIN', 'SUPER ADMIN'] },
            isDeleted: { $ne: true }
        };

        if (req.user.role !== 'SUPER ADMIN') {
            filter.location_id = req.user.location_id;
        }

        const deletedAdmin = await UserSchema.findOneAndUpdate(filter, { isDeleted: true }, { new: true });
        if (!deletedAdmin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        // Audit log
        await logAudit({
            userId: req.user.id,
            username: req.user.username,
            action: 'DELETE',
            targetModel: 'User',
            targetId: deletedAdmin._id,
            description: `Deleted admin "${deletedAdmin.username}" with role "${deletedAdmin.role}"`,
            changes: {
                username: deletedAdmin.username,
                fullname: deletedAdmin.fullname,
                role: deletedAdmin.role
            }
        });

        res.json({ success: true, message: 'Admin deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

module.exports = { getAllAdmins, getAdminById, updateAdminById, deleteAdminById };