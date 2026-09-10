const DAY_IN_MS = 24 * 60 * 60 * 1000;

const normalizeHost = (value = "") => value.split(":")[0].toLowerCase();

const isCrossSiteRequest = (req) => {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (!origin || !host) {
    return false;
  }

  try {
    const originHost = normalizeHost(new URL(origin).host);
    const requestHost = normalizeHost(host);
    return originHost !== requestHost;
  } catch {
    return false;
  }
};

const isHttpsRequest = (req) =>
  req.secure || req.headers["x-forwarded-proto"] === "https";

const getTokenCookieOptions = (req) => {
  const secure = isHttpsRequest(req);
  const crossSite = isCrossSiteRequest(req);

  return {
    httpOnly: true,
    secure,
    sameSite: secure && crossSite ? "none" : "lax",
    maxAge: DAY_IN_MS,
    path: "/",
  };
};

const attachAuthCookie = (req, res, token) => {
  res.cookie("token", token, getTokenCookieOptions(req));
};

const clearAuthCookie = (req, res) => {
  const { maxAge, ...cookieOptions } = getTokenCookieOptions(req);
  res.clearCookie("token", cookieOptions);
};

module.exports = {
  attachAuthCookie,
  clearAuthCookie,
  getTokenCookieOptions,
};
