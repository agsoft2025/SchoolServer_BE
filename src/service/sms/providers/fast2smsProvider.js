const axios = require('axios');

const ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';

// Route selection (FAST2SMS_ROUTE in .env):
//   q   -> quick transactional, free-form text, no sender/template. Use for testing.
//   dlt -> DLT route: content MUST match an approved template. Sends the numeric
//          template id as `message` plus pipe-separated `variables_values`.
//   otp -> Fast2SMS built-in OTP template ("Your OTP: NNNN"). `message` is the code.
const ROUTE = (process.env.FAST2SMS_ROUTE || 'q').toLowerCase();

// Fast2SMS `numbers` wants bare 10-digit Indian mobile numbers. Recipients flow
// through the app as 12-digit 91XXXXXXXXXX (WhatsApp format), so strip anything
// beyond the last 10 digits. Accepts a single value or a comma-separated list.
const toLocalNumbers = (value = '') =>
  String(value)
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .map((n) => (n.length > 10 ? n.slice(-10) : n))
    .filter(Boolean)
    .join(',');

// send({ to, message, templateId?, variables?, route? })
//   to        - single number or comma-separated list, 10-digit (no +91)
//   message   - rendered text (q route) / the OTP code (otp route)
//   templateId- overrides FAST2SMS_TEMPLATE_ID for the dlt route
//   variables - ordered array of values for the dlt template's {#var#} slots
//   route     - overrides FAST2SMS_ROUTE for this call only (e.g. login OTP always forces 'dlt'
//               even while the Bulk SMS Center is configured for the free-text 'q' route)
const send = async ({ to, message, templateId, variables, route }) => {
  const activeRoute = (route || ROUTE).toLowerCase();
  const params = { route: activeRoute, numbers: toLocalNumbers(to), flash: 0 };

  if (activeRoute === 'dlt') {
    params.sender_id = process.env.FAST2SMS_SENDER_ID;
    params.message = templateId || process.env.FAST2SMS_TEMPLATE_ID;
    // If the caller didn't pass ordered variables, fall back to the whole rendered
    // string as a single value (only valid for a one-variable template).
    params.variables_values = (Array.isArray(variables) && variables.length ? variables : [message]).join('|');
  } else if (activeRoute === 'otp') {
    params.variables_values = message;
  } else {
    params.message = message;
  }

  try {
    console.log("<<>>sms sending")
    const res = await axios.get(ENDPOINT, {
      params,
      headers: { authorization: process.env.FAST2SMS_API_KEY },
    });
console.log("<><>res",res)
    return { success: res.data?.return === true, raw: res.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      raw: error.response?.data,
    };
  }
};

module.exports = { name: 'fast2sms', send };
