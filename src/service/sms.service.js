const axios = require("axios");
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
