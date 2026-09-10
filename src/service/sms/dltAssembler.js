// DLT-approved templates carry positional variable slots written as {#var#}
// (e.g. {#alphanumeric#}). The final SMS is ALWAYS assembled here on the backend
// from the approved text + an ordered, validated list of values — the frontend
// only ever previews. Mirrors SchoolGlobalServer_BE/src/utils/dltTemplate.js
// (kept local: SchoolServer_BE is a separate deployable).

const DLT_TOKEN = /\{#\s*[A-Za-z0-9_]+\s*#\}/g;

const MAX_VAR_LENGTH = 30;

const countPlaceholders = (approvedText = '') =>
  (String(approvedText).match(DLT_TOKEN) || []).length;

// values: ordered array. fields: ordered field specs (optional, for labels/limits).
// Returns { ok, error }.
const validateValues = (approvedText, values = [], fields = []) => {
  const need = countPlaceholders(approvedText);
  if (!Array.isArray(values)) return { ok: false, error: 'values must be an array' };
  if (values.length !== need) {
    return { ok: false, error: `Template needs exactly ${need} value(s), received ${values.length}` };
  }
  for (let i = 0; i < values.length; i += 1) {
    const v = String(values[i] ?? '').trim();
    const label = fields[i]?.label ? ` (${fields[i].label})` : '';
    if (!v) return { ok: false, error: `Value ${i + 1}${label} is required` };
    const max = fields[i]?.maxLength || MAX_VAR_LENGTH;
    if (v.length > max) return { ok: false, error: `Value ${i + 1}${label} exceeds ${max} characters` };
  }
  return { ok: true };
};

// Replace the i-th {#...#} slot with values[i]; signature/punctuation untouched.
const assembleMessage = (approvedText, values = []) => {
  let i = 0;
  return String(approvedText).replace(DLT_TOKEN, () => String(values[i++] ?? '').trim());
};

module.exports = { DLT_TOKEN, MAX_VAR_LENGTH, countPlaceholders, validateValues, assembleMessage };
