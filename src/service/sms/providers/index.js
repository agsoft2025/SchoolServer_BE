const consoleProvider = require('./consoleProvider');
const fast2smsProvider = require('./fast2smsProvider');

const registry = {
  console: consoleProvider,
  fast2sms: fast2smsProvider,
};

// Pick via SMS_PROVIDER in .env. Falls back to the console (mock) provider so a
// missing/typo'd value never sends real SMS by accident.
const getActiveProvider = () => registry[process.env.SMS_PROVIDER] || registry.console;

module.exports = { getActiveProvider, registry };
