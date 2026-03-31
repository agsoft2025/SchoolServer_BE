const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const dotenv = require('dotenv').config();
const UserSchema = require("../model/userModel");
const logAudit = require('../utils/auditlogger');
const tokenBlacklist = require("../utils/blackList");
const { sendSMS, sendWhatsAppOTP } = require("../service/sms.service");
const studentModel = require("../model/studentModel");
const { default: axios } = require("axios");

exports.login = async (req, res) => {
    try {
        const { username, password, descriptor } = req.body;
        if (descriptor) {
            const allUsers = await UserSchema.find({ isDeleted: { $ne: true } }, { descriptor: 1, username: 1, role: 1, fullname: 1 });
            function euclideanDistance(desc1, desc2) {
                let sum = 0;
                for (let i = 0; i < desc1.length; i++) {
                    let diff = desc1[i] - desc2[i];
                    sum += diff * diff;
                }
                return Math.sqrt(sum);
            }
            let bestMatch = null;
            let minDistance = Infinity;

            for (const user of allUsers) {
                if (!user.descriptor || user.descriptor.length !== descriptor.length) continue;

                const dist = euclideanDistance(user.descriptor, descriptor);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = user;
                }
            }
            const MATCH_THRESHOLD = 0.4;

            if (!bestMatch || minDistance > MATCH_THRESHOLD) {
                return res.status(400).json({ message: "Face not recognized" });
            }

            const token = jwt.sign(
                { id: bestMatch.id, username: bestMatch.username, role: bestMatch.role },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            await logAudit({
                user: { id: bestMatch.id, username: bestMatch.username },
                username: bestMatch.username,
                action: 'LOGIN',
                targetModel: 'User',
                targetId: bestMatch._id,
                description: `User ${bestMatch.username} logged in via face recognition`
            });

            return res.json({
                token,
                user: {
                    id: bestMatch.id,
                    username: bestMatch.username,
                    fullName: bestMatch.fullname,
                    role: bestMatch.role,
                    subscription: bestMatch.subscription
                },
                distance: minDistance
            });
        }

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password required" });
        }

        const user = await UserSchema.findOne({ username: { $regex: `^${username}$`, $options: 'i' }, isDeleted: { $ne: true } });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (user.role?.toLocaleLowerCase() === "student") {
            if (user.subscription && user.subscriptionEnd <= Date.now()) {
                // subscription expired → turn it off
                user.subscription = false;
                await user.save();
            }

            if (!user.subscription) {
                // const token = jwt.sign(
                //     { id: user.id, username: user.username, role: user.role },
                //     process.env.JWT_SECRET,
                //     { expiresIn: '24h' }
                // );
                return res.json({
                    // token,
                    status: false,
                    user: {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullname,
                        role: user?.role,
                        subscription: user?.subscription
                    },
                    message: "user not subscribe"
                });

            }
            if (user.otpLockedUntil && user.otpLockedUntil > Date.now()) {
                const minutesLeft = Math.ceil((user.otpLockedUntil - Date.now()) / 60000);
                return res.status(429).send({
                    status: false,
                    message: `Too many attempts. Try again after ${minutesLeft} minutes`
                });
            }
            const studentData = await studentModel.findOne({ user_id: user._id })

            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            user.otp = otp;
            user.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

            user.otpAttempts = 0;
            user.otpAttemptedAt = null;
            user.otpLockedUntil = null;
            // console.log("<><>otp",otp)
            sendWhatsAppOTP(studentData.contact_number, otp, studentData.student_name)
            // console.log("<><>studentData",studentData);

            await user.save();
            //  const smsResponse = await sendSMS(otp, studentData.contact_number)

            // if (!smsResponse.status) {
            //     return res.status(400).send({ status: false, message: smsResponse.message })
            // }
            await logAudit({
                user: { id: user.id, username: user.username },
                username: user.username,
                action: 'LOGIN',
                targetModel: 'User',
                targetId: user._id,
                description: `User ${user.username} logged in`
            });
            return res.status(200).send({
                status: true,
                otp,
                user: {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullname,
                    role: user?.role,
                    subscription: user?.subscription
                },
                message: "OTP has been sent successfully to your registered mobile number"
            })

        }
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logAudit({
            user: { id: user.id, username: user.username },
            username: user.username,
            action: 'LOGIN',
            targetModel: 'User',
            targetId: user._id,
            description: `User ${user.username} logged in`
        });
        res.cookie("token", token, {
            httpOnly: true,          // prevents JS access (IMPORTANT for security)
            secure: false,           // true in production (HTTPS only)
            sameSite: "lax",         // or "none" if frontend/backend different domains
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        return res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullname,
                role: user?.role,
                subscription: user?.subscription
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
}

exports.verifyOTP = async (req, res) => {
    const { username, otp } = req.body;

    try {
        if (!username)
            return res.status(400).send({ status: false, message: "Username is required" });

        if (!otp)
            return res.status(400).send({ status: false, message: "OTP is required" });

        const user = await UserSchema.findOne({ username, isDeleted: { $ne: true } });

        if (!user)
            return res.status(400).send({ status: false, message: "Invalid username. Please contact admin." });

        // Check if locked due to too many attempts
        if (user.otpLockedUntil && user.otpLockedUntil > Date.now()) {
            const minutesLeft = Math.ceil((user.otpLockedUntil - Date.now()) / 60000);
            return res.status(429).send({
                status: false,
                message: `Too many incorrect attempts. Try again after ${minutesLeft} minutes`
            });
        }

        // Check if OTP was generated
        if (!user.otp || !user.otpExpiresAt) {
            return res.status(400).json({ status: false, message: "OTP not generated" });
        }

        // Check OTP Expiry
        if (user.otpExpiresAt < Date.now()) {
            return res.status(400).json({
                status: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        // Incorrect OTP
        if (otp !== user.otp) {
            user.otpAttempts = (user.otpAttempts || 0) + 1;
            user.otpAttemptedAt = new Date();

            // Lock user after 5 failed attempts
            if (user.otpAttempts >= 5) {
                user.otpLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }

            await user.save();

            return res.status(400).json({
                status: false,
                message: "Invalid OTP"
            });
        }

        // Correct OTP — Reset OTP fields
        user.otp = null;
        user.otpExpiresAt = null;
        user.otpAttempts = 0;
        user.otpLockedUntil = null;

        await user.save();

        // Generate Token
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        // Audit log
        await logAudit({
            user: { id: user.id, username: user.username },
            username: user.username,
            action: "LOGIN",
            targetModel: "User",
            targetId: user._id,
            description: `User ${user.username} logged in successfully`
        });

        return res.status(200).json({
            status: true,
            message: "OTP verified successfully",
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullname,
                role: user.role,
                subscription: user.subscription
            }
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.logout1 = async (req, res) => {
    try {
        const user = req.user;
        const token = req.headers.authorization?.split(" ")[1];

        if (!user || !token) {
            return res.status(401).json({ message: "Unauthorized: No user or token found" });
        }

        // Add token to blacklist
        tokenBlacklist.add(token);

        await logAudit({
            user: { id: user.id, username: user.username },
            username: user.username,
            action: 'LOGOUT',
            targetModel: 'User',
            targetId: user.id,
            description: `User ${user.username} logged out`
        });

        res.status(200).json({ message: "Logout successful" });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.logout = async (req, res) => {
  try {
    const user = req.user;

    const token =
      req.cookies.token ||
      req.headers.authorization?.split(" ")[1];

    if (!user || !token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    tokenBlacklist.add(token);

    await logAudit({
      user: { id: user.id, username: user.username },
      username: user.username,
      action: 'LOGOUT',
      targetModel: 'User',
      targetId: user.id,
      description: `User ${user.username} logged out`
    });

    // ✅ THIS is what you're missing
    res.clearCookie("token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax"
    });

    return res.status(200).json({ message: "Logout successful" });

  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};