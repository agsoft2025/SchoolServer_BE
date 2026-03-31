const WINDOW_MS = 5 * 1000; // 5 seconds
const lastRequest = new Map();

const auditThrottle = (req, res, next) => {
  if (!req.user?.id) {
    return next();
  }

  const key = `${req.user.id}:${req.path}`;
  const now = Date.now();
  const last = lastRequest.get(key) || 0;

  if (now < last + WINDOW_MS) {
    const wait = Math.ceil((last + WINDOW_MS - now) / 1000);
    return res.status(429).json({
      success: false,
      message: `Too many audit requests. Try again in ${wait} seconds.`,
    });
  }

  lastRequest.set(key, now);
  next();
};

module.exports = auditThrottle;
