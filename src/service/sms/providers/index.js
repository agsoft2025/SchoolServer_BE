const consoleProvider = require('./consoleProvider');
// Real SMS integration not live yet (DLT/template registration pending). Uncomment
// this line and the registry entry below once fast2sms is ready to go live.
// const fast2smsProvider = require('./fast2smsProvider');

const registry = {
  console: consoleProvider,
  // fast2sms: fast2smsProvider,
};

const getActiveProvider = () => {
  // Forced to console until fast2sms is uncommented above — every send prints to
  // the terminal instead of going out, regardless of SMS_PROVIDER in .env.
  return registry.console;
};

module.exports = { getActiveProvider, registry };
