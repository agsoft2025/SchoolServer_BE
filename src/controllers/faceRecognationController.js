const axios = require("axios")
const FormData = require("form-data");
const userModel = require("../model/userModel");
const jwt = require('jsonwebtoken')

function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
}

const euclideanDistanceVerify = (a, b) => {
    if (a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
};

exports.registerFaceID = async (req, res) => {
    try {
        const { userId } = req.body;
        console.log(req.file)
        if (!req.file) {
            return res.status(400).json({
                status: false,
                message: "Image is required"
            });
        }

        const formData = new FormData();
        formData.append("image", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await axios.post(
            "http://127.0.0.1:5001/encode",
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                }
            }
        );

        const newEmbedding = response.data.embedding;

        // 2️⃣ Fetch all existing face embeddings
        const usersWithFace = await userModel.find(
            { descriptor: { $exists: true, $ne: [] } },
            { descriptor: 1, username: 1, inmateId: 1 }
        );

        for (const user of usersWithFace) {
            if (!user.descriptor || !Array.isArray(user.descriptor) || user.descriptor.length === 0) {
                continue; // Skip users with no descriptor
            }
            const distance = euclideanDistance(user.descriptor, newEmbedding);

            if (distance < 0.4) {
                console.log("<><>user", user)
                return res.status(409).json({
                    status: false,
                    message: "Face already registered with another user"
                });
            }
        }

        await userModel.findByIdAndUpdate(userId, {
            descriptor: newEmbedding
        });

        return res.json({
            status: true,
            message:"face registered successfully"
        });
    } catch (error) {

        if (error && error.response && error.response.status === 400) {
            return res.status(500).send({ status: false, message: `${error.response.data.message}` })
        }
        return res.status(500).send({ status: false, message: "internal server down", error: error.message })
    }
}

exports.loginFaceID = async (req, res) => {
    try {
        // 1️⃣ Check if image is provided
        if (!req.file) {
            return res.status(400).json({
                status: false,
                message: "Image is required"
            });
        }

        // 2️⃣ Prepare form data for face embedding
        const formData = new FormData();
        formData.append("image", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // 3️⃣ Get embedding of uploaded face
        const response = await axios.post("http://127.0.0.1:5001/encode", formData, {
            headers: formData.getHeaders()
        });

        const loginEmbedding = response.data.embedding;

        // 4️⃣ Fetch all users with face embeddings
        const usersWithFace = await userModel.find(
            { descriptor: { $exists: true, $ne: [] } },
            { descriptor: 1, username: 1, fullname: 1, role: 1, subscription: 1, subscriptionEnd: 1 } 
        );

        // 5️⃣ Compare with existing embeddings
        for (const user of usersWithFace) {
            const distance = euclideanDistanceVerify(user.descriptor || [], loginEmbedding);
            if (distance < 7.5) { // Match threshold
                console.log("<><>distance",distance);
                console.log("<><>user",user);
                
                
                // ✅ Check subscription for students
                if (user.role === "student") {
                    if (user.subscription && user.subscriptionEnd <= Date.now()) {
                        // subscription expired → turn it off
                        user.subscription = false;
                        await user.save();
                    }

                    if (!user.subscription) {
                        return res.status(403).json({
                            status: false,
                            user: {
                                id: user._id,
                                username: user.username,
                                fullName: user.fullname,
                                role: user.role,
                                subscription: user.subscription
                            },
                            message: "User subscription has expired"
                        });
                    }
                }

                // ✅ Return matched user if subscription is valid
                  const token = jwt.sign(
                            { id: user._id, username: user.username, role: user.role },
                            process.env.JWT_SECRET,
                            { expiresIn: '24h' }
                        );
                return res.json({
                    status: true,
                    message: "Face matched",
                    token,
                    user: {
                        id: user._id,
                        username: user.username,
                        fullName: user.fullname,
                        role: user.role,
                        subscription: user.subscription
                    }
                });
            }
        }

        // 6️⃣ No match found
        return res.status(401).json({
            status: false,
            message: "No matching face found"
        });

    } catch (error) {
        console.error("loginFaceID error:", error);

        if (error && error.response && error.response.status === 400) {
            return res.status(400).json({ status: false, message: error.response.data.message });
        }

        return res.status(500).json({
            status: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// exports.loginFaceID = async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({
//                 status: false,
//                 message: "Image is required"
//             });
//         }

//         const formData = new FormData();
//         formData.append("image", req.file.buffer, {
//             filename: req.file.originalname,
//             contentType: req.file.mimetype
//         });

//         // 1️⃣ Get embedding of uploaded face
//         const response = await axios.post("http://127.0.0.1:5001/encode", formData, {
//             headers: formData.getHeaders()
//         });

//         const loginEmbedding = response.data.embedding;

//         // 2️⃣ Fetch all users with face embeddings
//         const usersWithFace = await userModel.find(
//             { descriptor: { $exists: true, $ne: [] } },
//             { descriptor: 1, username: 1, fullname: 1,role:1, subscription:1 } // Include info you want to return
//         );

//         // 3️⃣ Compare with existing embeddings
//         for (const user of usersWithFace) {
//             const distance = euclideanDistanceVerify(user.descriptor || [], loginEmbedding);

//             if (distance < 0.4) { // Match threshold
//                 return res.json({
//                     status: true,
//                     message: "Face matched",
//                     user: {
//                         id: user._id,
//                         username: user.username,
//                         fullName: user.fullname,
//                         role: user?.role,
//                         subscription: user?.subscription
//                     }
//                 });
//             }
//         }

//         // 4️⃣ No match found
//         return res.status(401).json({
//             status: false,
//             message: "No matching face found"
//         });

//     } catch (error) {
//         console.error("loginFaceID error:", error);

//         if (error && error.response && error.response.status === 400) {
//             return res.status(400).json({ status: false, message: error.response.data.message });
//         }

//         return res.status(500).json({
//             status: false,
//             message: "Internal server error",
//             error: error.message
//         });
//     }
// };



