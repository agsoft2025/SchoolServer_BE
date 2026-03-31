const logAudit = require("../utils/auditlogger");

const ACTION_MAP = {
  GET: "READ",
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE"
};

const NO_LOG_PATHS = ["/logs"];

const getTargetModel = (path) => {
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) return "ROOT";
  const model = segments[0];
  return model.replace(/[-_]/g, "_").toUpperCase();
};

const shouldSkipAudit = (req) => {
  const normalized = req.path.split("?")[0];
  return NO_LOG_PATHS.some((blocked) => normalized.startsWith(blocked));
};

const itemListString = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  const names = items.map((it) => it.itemName || it.name || it.productName || it.itemNo).filter(Boolean);
  return names.join(", ");
};

const customDescriptions = [
  {
    match: (req) => req.method === "POST" && req.path.startsWith("/pos-shop-cart"),
    build: (req) => {
      const studentId = req.body?.studentId || req.body?.student_id || req.body?.cart?.studentId;
      const itemsText = itemListString(req.body?.products || req.body?.items || req.body?.cart?.items);
      const amount = req.body?.totalAmount || req.body?.amount;
      return `POS purchase${studentId ? ` for ${studentId}` : ""}${itemsText ? ` (${itemsText})` : ""}${amount ? ` totaling ₹${amount}` : ""}`;
    },
  },
  {
    match: (req) => req.method === "POST" && req.path.startsWith("/inventory") && req.path.includes("create-canteen-stock"),
    build: (req) => {
      const item = req.body?.itemName;
      return `Added canteen item "${item || 'unknown'}"`;
    },
  },
  {
    match: (req) => req.method === "POST" && req.path.startsWith("/inventory"),
    build: (req) => {
      const invoice = req.body?.invoiceNo;
      const vendor = req.body?.vendorName;
      return `Inventory entry ${invoice || "no invoice"} from ${vendor || "unknown vendor"}`;
    },
  },
  {
    match: (req) => req.method === "POST" && req.path.startsWith("/users"),
    build: (req) => {
      return `Created user ${req.body?.username || req.body?.fullname || "unknown"}`;
    },
  },
  {
    match: (req) => req.method === "POST" && req.path.startsWith("/student"),
    build: (req) => {
      return `Created student ${req.body?.registration_number || req.body?.studentId || "new entry"}`;
    },
  },
];

const describeRequest = (req, action) => {
  const custom = customDescriptions.find((entry) => entry.match(req));
  if (custom) return custom.build(req);
  switch (action) {
    case "CREATE":
      return `Created ${getTargetModel(req.path).toLowerCase()} entry`;
    case "UPDATE":
      return `Updated ${getTargetModel(req.path).toLowerCase()} entry`;
    case "DELETE":
      return `Deleted ${getTargetModel(req.path).toLowerCase()} entry`;
    case "READ":
      return `Viewed ${getTargetModel(req.path).toLowerCase()}`;
    default:
      return `${req.user?.username || "User"} hit ${req.method} ${req.originalUrl}`;
  }
};

const auditRequestLogger = (req, res, next) => {
  if (shouldSkipAudit(req)) {
    return next();
  }

  res.on("finish", () => {
    if (!req.user?.id) return;
    const action = ACTION_MAP[req.method] || "READ";
    const targetModel = getTargetModel(req.path);

    logAudit({
      userId: req.user.id,
      username: req.user.username,
      action,
      targetModel,
      description: describeRequest(req, action),
    });
  });

  next();
};

module.exports = auditRequestLogger;
