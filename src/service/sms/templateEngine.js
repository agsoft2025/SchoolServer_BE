const PLACEHOLDER_PATTERN = /{{\s*(\w+)\s*}}/g;

const KNOWN_VARIABLES = [
  'student_name',
  'father_name',
  'mother_name',
  'registration_number',
  'class_name',
  'section',
  'hostel_name',
  'board_name',
];

const renderTemplate = (template, variables = {}) =>
  template.replace(PLACEHOLDER_PATTERN, (match, key) => (key in variables ? variables[key] || '' : match));

const extractPlaceholders = (template) => {
  const found = new Set();
  let match;
  const pattern = new RegExp(PLACEHOLDER_PATTERN);
  while ((match = pattern.exec(template))) {
    found.add(match[1]);
  }
  return [...found];
};

const findUnknownPlaceholders = (template) =>
  extractPlaceholders(template).filter((key) => !KNOWN_VARIABLES.includes(key));

module.exports = { renderTemplate, extractPlaceholders, findUnknownPlaceholders, KNOWN_VARIABLES };
