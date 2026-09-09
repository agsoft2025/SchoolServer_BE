const axios = require('axios');
const { countPlaceholders } = require('./dltAssembler');
const fallbackTemplates = require('../../config/smsTemplates');

// Reads the approved SCHOOL SMS templates from the central master
// (SchoolGlobalServer_BE) over the trusted service-key channel, with a short
// in-memory cache and a last-good / file fallback so the SMS Center degrades
// gracefully when the Global server is unreachable.

const TTL_MS = Number(process.env.SMS_TEMPLATE_CACHE_TTL_MS) || 60_000;
const REQUEST_TIMEOUT_MS = 8000;

let cache = { at: 0, data: null };
let lastGood = null; // last successful Global response (normalized)

const normalize = (t, source) => ({
  id: String(t.id ?? t._id ?? t.key),
  key: String(t.key ?? t.id ?? t._id),
  name: t.name || t.label || 'Untitled template',
  domain: t.domain || 'SCHOOL',
  dltTemplateId: String(t.dltTemplateId || '').trim(),
  approvedText: t.approvedText || '',
  fields: Array.isArray(t.fields) ? t.fields : [],
  placeholderCount:
    typeof t.placeholderCount === 'number' ? t.placeholderCount : countPlaceholders(t.approvedText || ''),
  version: typeof t.version === 'number' ? t.version : 1,
  status: t.status || 'ACTIVE',
  source,
});

// Defensive filter — the Global endpoint already constrains this, but the file
// fallback and any future drift must never surface a non-sendable template.
const usable = (t) =>
  t.domain === 'SCHOOL' && t.status === 'ACTIVE' && !!t.dltTemplateId && t.approvedText && t.fields.length > 0;

const fallback = () => fallbackTemplates.map((t) => normalize(t, 'fallback')).filter(usable);

const fetchFromGlobal = async () => {
  const baseUrl = (process.env.GLOBAL_URL || '').trim().replace(/\/+$/, '');
  const key = process.env.INTERNAL_SERVICE_KEY;
  if (!baseUrl || !key) throw new Error('GLOBAL_URL / INTERNAL_SERVICE_KEY not configured');

  const res = await axios.get(`${baseUrl}/api/sms-templates/internal/active`, {
    params: { domain: 'SCHOOL' },
    headers: { 'x-internal-service-key': key },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows.map((t) => normalize(t, 'global')).filter(usable);
};

const getActiveTemplates = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < TTL_MS) return cache.data;

  try {
    const data = await fetchFromGlobal();
    cache = { at: now, data };
    lastGood = data;
    return data;
  } catch (error) {
    console.error('SMS template master unreachable, using fallback:', error.message);
    const data = lastGood || fallback();
    // Cache the fallback briefly too, so a Global outage doesn't hammer it.
    cache = { at: now, data };
    return data;
  }
};

const findActiveTemplate = async (idOrKey) => {
  if (!idOrKey) return null;
  const templates = await getActiveTemplates();
  console.log("<><>templates",templates)
  const wanted = String(idOrKey);
  return templates.find((t) => t.id === wanted || t.key === wanted) || null;
};

module.exports = { getActiveTemplates, findActiveTemplate };
