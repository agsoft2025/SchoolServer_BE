const crypto = require('crypto');
const Student = require('../model/studentModel');
const Transaction = require('../model/transactionModel.js');
const { createOrder } = require('../service/razorpay.service.js');
const userModel = require('../model/userModel.js');
const studentModel = require('../model/studentModel');
const financialModel = require('../model/financialModel.js');
const studentLocation = require('../model/studentLocationModel.js');
const { default: axios } = require('axios');

const buildForwardHeaders = (req) => {
  const headers = {};
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }
  if (req.headers.cookie) {
    headers.cookie = req.headers.cookie;
  }
  return headers;
};

const getAxiosErrorDetails = (error, fallbackMessage) => {
  if (error.response) {
    return {
      status: error.response.status || 500,
      message:
        error.response.data?.message ||
        error.response.data?.error ||
        fallbackMessage,
      details: error.response.data || null,
    };
  }

  return {
    status: 500,
    message: error.message || fallbackMessage,
    details: null,
  };
};

const hasLocalRazorpayConfig = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const isRazorpayAuthError = (error) =>
  error?.statusCode === 401 ||
  error?.error?.code === "BAD_REQUEST_ERROR" ||
  /Authentication failed/i.test(error?.error?.description || error?.message || "");

const createParentOrderViaGlobal = async (req, studentData, amount, shortReceipt) => {
  if (!process.env.GLOBAL_URL) {
    throw new Error("Razorpay is not configured on this server");
  }

  const payload = {
    amount,
    shortReceipt,
    studentData,
    locationId: studentData?.location_id,
    subscription_type: "MONTHLY",
    student_info: studentData,
  };

  const orderResponse = await axios.post(
    `${process.env.GLOBAL_URL}/api/payment/create`,
    payload,
    {
      headers: buildForwardHeaders(req),
      withCredentials: true,
    }
  );

  return orderResponse.data?.order;
};

const verifyParentPaymentViaGlobal = async (req, payload) => {
  if (!process.env.GLOBAL_URL) {
    throw new Error("Razorpay is not configured on this server");
  }

  await axios.post(`${process.env.GLOBAL_URL}/api/payment/verify`, payload, {
    headers: buildForwardHeaders(req),
    withCredentials: true,
  });
};

// 1️⃣ Create Razorpay Order global server
exports.createOrder = async (req, res) => {
  try {
    const { studentId, amount } = req.body;
    const studentData = await studentModel.findOne({ user_id: studentId });
    console.log("studentData",studentData);
    
    if (!studentData) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const shortReceipt = `order_${studentData.registration_number}_${Date.now().toString().slice(-6)}`;
    // subscription_type:  ["MONTHLY", "QUARTERLY", "YEARLY"]
    const schoolData = await studentLocation.find();
    // console.log("schoolData",schoolData);
    
    // if (!schoolData.length || !schoolData[0].global_location_id) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "School global location is not configured",
    //   });
    // }

    const payload = {
      amount,
      shortReceipt,
      studentData,
      locationId: studentData?.location_id,
      subscription_type: "MONTHLY",
      student_info: studentData,
    };
    const orderResponse = await axios.post(`${process.env.GLOBAL_URL}/api/payment/create`, payload, {
      headers: buildForwardHeaders(req),
      withCredentials: true,
    });
    const orderData = orderResponse.data;
    if (orderData?.subscription) {
      return res.status(200).send({ status: true, message: orderData.message });
    }
    const order = orderData.order;
    // const transaction = new Transaction({
    //   student_id: studentId,
    //   order_id: order.id,
    //   amount,
    //   user_id: studentData.user_id
    // });
    // await transaction.save();
    res.status(200).json({ success: true, order, message: orderData?.data?.message || "default message" });
  } catch (error) {
    const axiosError = getAxiosErrorDetails(error, "Order creation failed");
    console.log(error)
    console.error("Payment create error:", axiosError.message, axiosError.details || error);
    res.status(axiosError.status).json({
      success: false,
      message: axiosError.message,
    });
  }
};

// 2️⃣ Verify Payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, studentId } = req.body;

    const payload = { razorpay_order_id, razorpay_payment_id, razorpay_signature, studentId };
    await axios.post(`${process.env.GLOBAL_URL}/api/payment/verify`, payload, {
      headers: buildForwardHeaders(req),
      withCredentials: true,
    });
    // if (expectedSignature !== razorpay_signature) {
    //   return res.status(400).json({ success: false, message: "Invalid signature" });
    // }

    // const transaction = await Transaction.findOneAndUpdate(
    //   { order_id: razorpay_order_id },
    //   { payment_id: razorpay_payment_id, status: 'paid' },
    //   { new: true }
    // );
    // const studentData = await studentModel.findOne({user_id:studentId})
    // const financialData ={
    //   student_id:studentData._id,
    //   transaction:"TRANSFER",
    //   depositType:"UPI",
    //   status:"SUCCESS",
    //   depositAmount:expectedSignature.data.subscription.amount
    // } 
    // const fin = await financialModel.create(financialData)
    
    await userModel.findByIdAndUpdate(studentId, {
      subscription: true,
      subscriptionStart: new Date(),
      subscriptionEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    // await Student.findByIdAndUpdate(transaction.student_id, {
    //     $inc: { wallet_balance: transaction.amount }
    // });

    res.json({ success: true, message: "Payment subscription is updated" });
  } catch (error) {
    const axiosError = getAxiosErrorDetails(error, "Payment verification failed");
    console.error("Payment verify error:", axiosError.message, axiosError.details || error);
    res.status(axiosError.status).json({
      success: false,
      message: axiosError.message,
    });
  }
};

// parent make payment
exports.parentCreatePayment = async (req, res) => {
  try {
    const { studentId, amount } = req.body;
    const studentData = await studentModel.findOne({ user_id: studentId });
    if (!studentData) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const shortReceipt = `order_${studentData.registration_number}_${Date.now().toString().slice(-6)}`;
    let order;

    if (hasLocalRazorpayConfig()) {
      try {
        order = await createOrder(amount, shortReceipt);
      } catch (error) {
        if (!isRazorpayAuthError(error) || !process.env.GLOBAL_URL) {
          throw error;
        }

        order = await createParentOrderViaGlobal(req, studentData, amount, shortReceipt);
      }
    } else {
      order = await createParentOrderViaGlobal(req, studentData, amount, shortReceipt);
    }

    if (!order?.id) {
      throw new Error("Order creation failed");
    }

    const transaction = new Transaction({
      student_id: studentId,
      order_id: order.id,
      amount,
      user_id: studentData.user_id
    });
    await transaction.save();

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Parent payment create error:", error?.error || error?.message || error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error?.error?.description || error?.message || "Order creation failed",
    });
  }
}

exports.parentVerifyPayment1 = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, studentId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const transaction = await Transaction.findOneAndUpdate(
      { order_id: razorpay_order_id },
      { payment_id: razorpay_payment_id, status: 'paid' },
      { new: true }
    );
    const data = await Student.findOneAndUpdate(
      { user_id: transaction.student_id },
      { $inc: { deposite_amount: transaction.amount } }
    );

    res.json({ success: true, message: "Payment verified and wallet updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

const legacyParentVerifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      studentId,
    } = req.body;

    // 🔐 Step 1: Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // 💳 Step 2: Update transaction status
    const transaction = await Transaction.findOneAndUpdate(
      { order_id: razorpay_order_id },
      { payment_id: razorpay_payment_id, status: "paid" },
      { new: true }
    );

    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }


    // 🧾 Step 3: Update student's deposit amount
    const student = await Student.findOneAndUpdate({ user_id: studentId },
      { $inc: { deposite_amount: transaction.amount } },
      { new: true }
    );

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }


    // 💰 Step 4: Create a financial record for this deposit
    const financialData = {
      student_id: student._id,
      custodyType: "DEPOSIT", // or your own classification
      transaction: transaction._id.toString(),
      type: "CREDIT", // deposit = CREDIT
      status: "SUCCESS",
      depositName: student.name || "Parent Deposit",
      relationShipId: student.parent_id || null, // if you store parent id in Student
      depositAmount: transaction.amount,
      depositType: "ONLINE_PAYMENT",
      depositedByType: "USER", // assuming parent user
      depositedById: transaction.created_by || null, // optional, from transaction
      remarks: `Payment ID: ${razorpay_payment_id}`,
    };

    const finData = await financialModel.create(financialData);
    res.json({
      success: true,
      message: "Payment verified, wallet updated, and financial record saved.",
    });
  } catch (error) {
    console.error("Payment verify error:", error);
    res
      .status(500)
      .json({ success: false, message: "Payment verification failed" });
  }
};

exports.parentVerifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      studentId,
    } = req.body;

    const verificationPayload = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      studentId,
    };

    let isVerified = false;

    if (process.env.RAZORPAY_KEY_SECRET) {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      isVerified = expectedSignature === razorpay_signature;
    }

    if (!isVerified) {
      try {
        await verifyParentPaymentViaGlobal(req, verificationPayload);
        isVerified = true;
      } catch (error) {
        if (!process.env.RAZORPAY_KEY_SECRET) {
          throw error;
        }
      }
    }

    if (!isVerified) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const transaction = await Transaction.findOneAndUpdate(
      { order_id: razorpay_order_id },
      { payment_id: razorpay_payment_id, status: "paid" },
      { new: true }
    );

    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const student = await Student.findOneAndUpdate(
      { user_id: studentId },
      { $inc: { deposite_amount: transaction.amount } },
      { new: true }
    );

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    const financialData = {
      student_id: student._id,
      custodyType: "DEPOSIT",
      transaction: transaction._id.toString(),
      type: "CREDIT",
      status: "SUCCESS",
      depositName: student.name || "Parent Deposit",
      relationShipId: student.parent_id || null,
      depositAmount: transaction.amount,
      depositType: "ONLINE_PAYMENT",
      depositedByType: "USER",
      depositedById: transaction.created_by || null,
      remarks: `Payment ID: ${razorpay_payment_id}`,
    };

    await financialModel.create(financialData);
    res.json({
      success: true,
      message: "Payment verified, wallet updated, and financial record saved.",
    });
  } catch (error) {
    console.error("Payment verify error:", error);
    res
      .status(500)
      .json({ success: false, message: "Payment verification failed" });
  }
};
