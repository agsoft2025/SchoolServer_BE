const express = require('express');
const app = express();
const path = require('path');
require('dotenv').config()
const cors = require('cors');
const { dbConnect } = require('./config/db');
const { scheduleBackup, rescheduleBackupOnUpdate } = require('./config/cronBackup');

dbConnect();
// === Daily Backup at 12:00 AM ===
scheduleBackup();           // initial schedule
rescheduleBackupOnUpdate();
const hostname = '0.0.0.0';

// <<<=== ADD THIS HERE: Preload Face Recognition Models ===>>>
// const { loadModels } = require('./service/faceMatchService');
// loadModels()
//   .then(() => console.log('Models preloaded successfully'))
//   .catch(err => console.error('Model load failed:', err));
// <<<=== END ===>>>

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
const studentRoutes = require("./routes/studentRoutes");
const financialRoutes = require("./routes/financialRoutes");
const tuckShopRoutes = require("./routes/tuckShopRoutes");
const cartRoutes = require("./routes/cartRoutes");
const userRoutes = require("./routes/usersRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");
const auditLogsRoutes = require("./routes/auditRoutes");
const bulkOperations = require("./routes/bulkOprationRoutes");
const departmentRoles = require("./routes/departmentRoutes");
const studentLocationRoutes = require('./routes/studentLocationRoutes')
const inventoryRoutes = require('./routes/inventoryRoutes')
const backupRoutes = require('./routes/backupRoutes')
const fileUploadRoutes = require('./routes/fileUploadRoutes')
const paymentRoutes = require("./routes/paymentRoutes")
const faceRouted = require("./routes/faceRecognationRoute")
const globalRoutes = require("./routes/globalServerRoutes")
const whatsapppRoutes = require("./routes/whatsappRoutes")
const morgan = require("morgan");
const { sendSMS, sendWhatsAppOTP } = require('./service/sms.service');
const { authenticateToken } = require('./middleware/authToken');
const auditRequestLogger = require('./middleware/auditRequestLogger');
const authRoutes = require("./routes/authRoutes")
const adminRoutes = require("./routes/adminRoutes")
const cookieParser = require("cookie-parser");

const allowedOrigins = ["http://localhost:5173","http://localhost:5174"]

// const corsOptionsDelegate = function (req, callback) {
//     let corsOptions;
//     if (allowedOrigins.includes(req.header('Origin'))) {
//         corsOptions = { origin: true };
//     } else {
//         corsOptions = { origin: false }; 
//     }
//     callback(null, corsOptions);
// };

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(cookieParser());
app.use(morgan(":method :url :status :response-time ms"));
app.use("/webhook", whatsapppRoutes)
app.use("/user", authRoutes);
app.use("/admin", adminRoutes);

app.use("/student-pro", studentRoutes);
app.use("/student", authenticateToken, auditRequestLogger, studentRoutes);
app.use("/financial", authenticateToken, auditRequestLogger, financialRoutes);
app.use("/tuck-shop", authenticateToken, auditRequestLogger, tuckShopRoutes);
app.use("/pos-shop-cart", authenticateToken, auditRequestLogger, cartRoutes);
app.use("/users", authenticateToken, auditRequestLogger, userRoutes);
app.use("/faceRecognition", userRoutes)
app.use("/dashboard", authenticateToken, auditRequestLogger, dashboardRoutes);
app.use("/reports", authenticateToken, auditRequestLogger, reportRoutes);
app.use("/logs", authenticateToken, auditRequestLogger, auditLogsRoutes);
app.use("/bulk-oprations", authenticateToken, auditRequestLogger, bulkOperations);
app.use("/department", authenticateToken, auditRequestLogger, departmentRoles);
app.use("/location", authenticateToken, auditRequestLogger, studentLocationRoutes)
// inventory and canteen operation
app.use('/inventory', authenticateToken, auditRequestLogger, inventoryRoutes)
app.use("/backup", authenticateToken, auditRequestLogger, backupRoutes)
app.use("/upload", authenticateToken, auditRequestLogger, fileUploadRoutes)
app.use("/payment", authenticateToken, auditRequestLogger, paymentRoutes)
app.use("/face", authenticateToken, auditRequestLogger, faceRouted)
app.use("/api/subscribers", authenticateToken, auditRequestLogger, globalRoutes)

// sendWhatsAppOTP("918139886630","813988")
// sendWhatsAppOTP("+918940891631","813988")


app.listen(process.env.PORT, hostname, () => {
    console.log(`server running successfully on ${process.env.PORT}`)
    console.log('Running in', process.env.NODE_ENV, 'mode');
})
app.use("/transactions", authenticateToken, auditRequestLogger, transactionRoutes);
