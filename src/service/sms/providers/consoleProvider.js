// Dev/mock provider — prints each message to the terminal instead of calling a real gateway.
// Lets the whole send pipeline (queueing, throttling, logging, retry) be exercised before
// DLT/template registration with a real SMS provider is in place.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const send = async ({ to, message }) => {
  await sleep(Number(process.env.SMS_SEND_DELAY_MS) || 150);
  console.log(`[SMS:console] -> ${to} | ${message}`);
  return { success: true, raw: { mock: true, deliveredAt: new Date().toISOString() } };
};

module.exports = { name: 'console', send };
