const WINDOW_MS = 5 * 1000; // 5 seconds
const MAX_REQUESTS = 10; // Allow 10 requests per window
const requests = new Map();

const auditThrottle = (req, res, next) => {
  if (!req.user?.id) {
    return next();
  }

  const key = `${req.user.id}:${req.path}`;
  const now = Date.now();
  
  if (!requests.has(key)) {
    requests.set(key, { count: 1, firstRequest: now });
    return next();
  }

  const userRequests = requests.get(key);

  // If window has passed, reset
  if (now > userRequests.firstRequest + WINDOW_MS) {
    requests.set(key, { count: 1, firstRequest: now });
    return next();
  }

  // If within window but exceeding max
  if (userRequests.count >= MAX_REQUESTS) {
    const wait = Math.ceil((userRequests.firstRequest + WINDOW_MS - now) / 1000);
    return res.status(429).json({
      success: false,
      message: `Too many audit requests. Try again in ${wait} seconds.`,
    });
  }

  // Allow and increment
  userRequests.count += 1;
  next();
};

module.exports = auditThrottle;
