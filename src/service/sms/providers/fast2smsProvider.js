const axios = require('axios');

// Structured for when DLT/template registration is complete — not the active provider
// by default (see SMS_PROVIDER in .env). "route" must be a DLT-approved route for
// production traffic; the default quick route is for testing only.
const send = async ({ to, message }) => {
  try {
    const res = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        route: process.env.FAST2SMS_ROUTE || 'q',
        message,
        flash: 0,
        numbers: to,
      },
    });

    return { success: !!res.data?.return, raw: res.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      raw: error.response?.data,
    };
  }
};

module.exports = { name: 'fast2sms', send };
