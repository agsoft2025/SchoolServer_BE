const axios = require('axios');

const ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';

// Route selection (FAST2SMS_ROUTE in .env):
//   q          -> quick transactional, free-form text, no sender/template. Testing only.
//   dlt        -> Fast2SMS "DLT" route: `message` is a short Fast2SMS *Message ID*
//                 (e.g. 224809) that Fast2SMS minted when the template was added to
//                 its DLT Manager; variables go in `variables_values`.
//   dlt_manual -> Fast2SMS "DLT Manual" route: `message` is the fully assembled text
//                 and `template_id` is the 19-digit *DLT content template id* from
//                 the operator portal. Needed because the SMS Template Master stores
//                 the operator's 19-digit ids, which the plain `dlt` route rejects
//                 with 424 "Invalid Message ID (or Template, Entity ID)".
//   otp        -> Fast2SMS built-in OTP template. `message` is the code.
const ROUTE = (process.env.FAST2SMS_ROUTE || 'q').toLowerCase();

// A 19-digit operator DLT content-template id vs a short Fast2SMS Message ID.
const isOperatorDltTemplateId = (id) => /^\d{12,}$/.test(String(id || '').trim());

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
//   senderId  - the DLT-approved sender header for the dlt route (derived from
//               the template server-side); falls back to FAST2SMS_SENDER_ID
//   route     - overrides FAST2SMS_ROUTE for this call only (e.g. login OTP always forces 'dlt'
//               even while the Bulk SMS Center is configured for the free-text 'q' route)
const send = async ({ to, message, templateId, variables, senderId, route }) => {
  const activeRoute = (route || ROUTE).toLowerCase();
  const params = { route: activeRoute, numbers: toLocalNumbers(to), flash: 0 };

  if (activeRoute === 'dlt' || activeRoute === 'dlt_manual') {
    const tid = templateId || process.env.FAST2SMS_TEMPLATE_ID;
    params.sender_id = senderId || process.env.FAST2SMS_SENDER_ID;

    // The SMS Template Master stores the operator's 19-digit DLT template id,
    // which only the `dlt_manual` route accepts (with the assembled text). A
    // short id (e.g. the OTP template 224809) is a Fast2SMS Message ID for the
    // plain `dlt` route.
    if (activeRoute === 'dlt_manual' || isOperatorDltTemplateId(tid)) {
      params.route = 'dlt_manual';
      params.template_id = tid;
      params.message = message; // fully assembled, DLT-approved text
      if (process.env.FAST2SMS_ENTITY_ID) params.entity_id = process.env.FAST2SMS_ENTITY_ID;
    } else {
      params.route = 'dlt';
      params.message = tid;
      // If the caller didn't pass ordered variables, fall back to the whole rendered
      // string as a single value (only valid for a one-variable template).
      params.variables_values = (Array.isArray(variables) && variables.length ? variables : [message]).join('|');
    }
  } else if (activeRoute === 'otp') {
    params.variables_values = message;
  } else {
    params.message = message;
  }

  try {
    const res = await axios.get(ENDPOINT, {
      params,
      headers: { authorization: process.env.FAST2SMS_API_KEY },
    });
    // Log only the provider's JSON body — never `res` itself (it carries the
    // request config incl. the API key header).
    console.log('[SMS:fast2sms]', params.route, '->', JSON.stringify(res.data));
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
