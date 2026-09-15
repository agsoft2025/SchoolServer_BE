const axios = require('axios');
const { countPlaceholders } = require('./dltAssembler');
const fallbackTemplates = require('../../config/smsTemplates');

// Reads the approved SCHOOL SMS templates from the central master
// (SchoolGlobalServer_BE) over the trusted service-key channel, with a short
// in-memory cache and a last-good / file fallback so the SMS Center degrades
// gracefully when the Global server is unreachable.
//
// Templates are scoped per school by the school's assigned Sender ID(s): the
// caller passes the school's `externalId` (== this server's StudentLocation._id
// == the Global Location.externalId) and only templates registered under a
// Sender ID that school may use come back, together with `meta`:
//   { assignedSenderIds: [...], source: 'config' | 'fallback' }
// Each school gets its own cache slot; the no-key path (`__all`) is only used
// when a location cannot be resolved (trusted SUPER ADMIN).

const TTL_MS = Number(process.env.SMS_TEMPLATE_CACHE_TTL_MS) || 60_000;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_HEADER = (process.env.FAST2SMS_SENDER_ID || 'AGSWSL').trim().toUpperCase();

const ALL_KEY = '__all';
const caches = new Map(); // key(externalId | __all) -> { at, data, meta }
const lastGood = new Map(); // key -> last successful { data, meta }

const normalize = (t, source) => ({
  id: String(t.id ?? t._id ?? t.key),
  key: String(t.key ?? t.id ?? t._id),
  name: t.name || t.label || 'Untitled template',
  domain: t.domain || 'SCHOOL',
  dltTemplateId: String(t.dltTemplateId || '').trim(),
  senderId: String(t.senderId || '').trim().toUpperCase(),
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
  t.domain === 'SCHOOL' &&
  t.status === 'ACTIVE' &&
  !!t.dltTemplateId &&
  !!t.senderId &&
  t.approvedText &&
  t.fields.length > 0;

const fallbackResult = () => {
  const data = fallbackTemplates.map((t) => normalize(t, 'fallback')).filter(usable);
  return { data, meta: { assignedSenderIds: [...new Set(data.map((t) => t.senderId))], source: 'fallback' } };
};

const fetchFromGlobal = async (externalId) => {
  const baseUrl = (process.env.GLOBAL_URL || '').trim().replace(/\/+$/, '');
  const key = process.env.INTERNAL_SERVICE_KEY;
  if (!baseUrl || !key) throw new Error('GLOBAL_URL / INTERNAL_SERVICE_KEY not configured');

  const params = { domain: 'SCHOOL' };
  if (externalId) params.externalId = String(externalId);

  const res = await axios.get(`${baseUrl}/api/sms-templates/internal/active`, {
    params,
    headers: { 'x-internal-service-key': key },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  const data = rows.map((t) => normalize(t, 'global')).filter(usable);
  const rawMeta = res.data?.meta || {};
  const meta = {
    assignedSenderIds: Array.isArray(rawMeta.assignedSenderIds)
      ? rawMeta.assignedSenderIds.map((h) => String(h).toUpperCase())
      : [...new Set(data.map((t) => t.senderId))],
    source: rawMeta.source === 'config' ? 'config' : 'fallback',
  };
  return { data, meta };
};

const getResult = async ({ externalId, force = false } = {}) => {
  const cacheKey = externalId ? String(externalId) : ALL_KEY;
  const now = Date.now();
  const hit = caches.get(cacheKey);
  if (!force && hit && now - hit.at < TTL_MS) return hit;

  try {
    const result = await fetchFromGlobal(externalId);
    const entry = { at: now, ...result };
    caches.set(cacheKey, entry);
    lastGood.set(cacheKey, result);
    return entry;
  } catch (error) {
    console.error('SMS template master unreachable, using fallback:', error.message);
    const result = lastGood.get(cacheKey) || fallbackResult();
    const entry = { at: now, ...result };
    caches.set(cacheKey, entry); // cache the fallback briefly so an outage doesn't hammer Global
    return entry;
  }
};

const getActiveTemplates = async (opts = {}) => (await getResult(opts)).data;

// { assignedSenderIds: string[], source: 'config' | 'fallback' } for the school.
const getSchoolSmsMeta = async (externalId) => {
  const { meta } = await getResult({ externalId });
  return meta || { assignedSenderIds: [], source: 'fallback' };
};

const findActiveTemplate = async (idOrKey, externalId) => {
  if (!idOrKey) return null;
  const templates = await getActiveTemplates({ externalId });
  const wanted = String(idOrKey);
  return templates.find((t) => t.id === wanted || t.key === wanted) || null;
};

module.exports = { getActiveTemplates, getSchoolSmsMeta, findActiveTemplate, DEFAULT_SENDER_HEADER: DEFAULT_HEADER };
