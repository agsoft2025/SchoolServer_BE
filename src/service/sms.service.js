const axios = require("axios");
const { send: sendFast2Sms } = require("./sms/providers/fast2smsProvider");

// Fast2SMS numbers param wants a bare 10-digit Indian mobile number, but contact_number
// is stored/passed around with the 91 country code for WhatsApp's benefit -- strip it here.
const toFast2SmsNumber = (phone = "") => {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
};

// Login OTP via SMS (Fast2SMS DLT template), alongside sendWhatsAppOTP below.
// Forces route: 'dlt' regardless of FAST2SMS_ROUTE so this isn't affected by however
// the Bulk SMS Center (SMS_PROVIDER/FAST2SMS_ROUTE) happens to be configured.
exports.sendSMS = (phone, otp, name) =>
  sendFast2Sms({
    to: toFast2SmsNumber(phone),
    message: otp,
    route: "dlt",
    templateId: process.env.FAST2SMS_OTP_TEMPLATE_ID,
    variables: [name, otp],
  });

// whatsapp sms service (whatsapp cloud)
exports.sendWhatsAppOTP = async (phone, otp,name) => {
  try {
    const url = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone, // must be like 919XXXXXXXXX (no +)
      type: "template",
      template: {
        name: "system_info", // EXACT approved template name
        language: {
          code: "en_US"
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: `${name}`
              },
              {
                type: "text",
                text: otp.toString()
              }
            ]
          }
        ]
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log("<><>whatsapp",res)
    return { success: true };

  } catch (error) {
    console.error("WhatsApp error:", error.response?.data || error.message);
    return { success: false };
  }
};

// exports.sendWhatsAppOTP = async (phone, otp) => { 
//   console.log("<><>phone", phone, "otp", otp)
//   console.log("Using Phone Number ID:", process.env.PHONE_NUMBER_ID);
//   try {
//     const url = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;

//    const payload = {
//   messaging_product: "whatsapp",
//   to: phone,
//   type: "template",
//   template: {
//     name: "system_info",
//     language: { code: "en_US" },
//     components: [
//       {
//         type: "body",
//         parameters: [
//           { type: "text", text: "Ajay" },
//           { type: "text", text: otp }
//         ]
//       }
//     ]
//   }
// };

//     const res = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
//         "Content-Type": "application/json"
//       }
//     });

//     console.log("WhatsApp OTP sent:", res.data);
//     return { success: true };

//   } catch (error) {
//     console.error(
//       "WhatsApp error:",
//       error.response?.data || error.message
//     );
//     return { success: false, error: error.response?.data };
//   }
// };
