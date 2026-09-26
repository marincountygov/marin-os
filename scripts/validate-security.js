#!/usr/bin/env node
// Validates a security.json file against schemas/security.schema.json.
// No dependencies — this repo has no build step and this check shouldn't add
// one (see check-catalog-sync.js). This is a small, hand-rolled validator for
// the subset of JSON Schema draft 2020-12 this schema actually uses (type,
// required, properties/additionalProperties, enum, const, items, minimum,
// local $ref into $defs, and loose format checks for date/date-time/uri) —
// not a general-purpose implementation. If security.schema.json starts using
// a JSON Schema feature this file doesn't handle, this file needs updating
// too; it does not silently pass unrecognized keywords as "no opinion."
//
// Usage: node scripts/validate-security.js <path-to-security.json> [...more paths]
//        node scripts/validate-security.js   (defaults to this repo's own security.json)

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const schemaPath = path.join(repoRoot, "schemas", "security.schema.json");

function resolveRef(ref, schema) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Only local "#/..." refs are supported, got: ${ref}`);
  }
  const parts = ref.slice(2).split("/");
  let node = schema;
  for (const part of parts) {
    if (!(part in node)) throw new Error(`Cannot resolve $ref "${ref}" — missing "${part}"`);
    node = node[part];
  }
  return node;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value, type) {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "object") return typeOf(value) === "object";
  return typeOf(value) === type;
}

// Loose, non-strict format checks — enough to catch an obviously malformed
// value, not a full RFC validator.
const FORMAT_CHECKS = {
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  "date-time": (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(v),
  uri: (v) => /^[a-z][a-z0-9+.-]*:/i.test(v),
};

function validate(schema, node, data, dataPath, errors) {
  if (node.$ref) node = resolveRef(node.$ref, schema);

  if (node.enum && !node.enum.includes(data)) {
    errors.push(`${dataPath}: must be one of ${JSON.stringify(node.enum)}, got ${JSON.stringify(data)}`);
    return;
  }
  if ("const" in node && data !== node.const) {
    errors.push(`${dataPath}: must equal ${JSON.stringify(node.const)}, got ${JSON.stringify(data)}`);
    return;
  }
  if (node.type && !matchesType(data, node.type)) {
    errors.push(`${dataPath}: must be of type "${node.type}", got "${typeOf(data)}"`);
    return;
  }
  if (node.type === "string" && node.format && FORMAT_CHECKS[node.format] && !FORMAT_CHECKS[node.format](data)) {
    errors.push(`${dataPath}: does not look like a valid "${node.format}"`);
  }
  if (node.type === "integer" && typeof node.minimum === "number" && data < node.minimum) {
    errors.push(`${dataPath}: must be >= ${node.minimum}, got ${data}`);
  }

  if (node.type === "object" || (!node.type && node.properties)) {
    for (const key of node.required || []) {
      if (!(key in data)) errors.push(`${dataPath}: missing required property "${key}"`);
    }
    for (const key of Object.keys(data)) {
      const propSchema = node.properties && node.properties[key];
      if (propSchema) {
        validate(schema, propSchema, data[key], `${dataPath}.${key}`, errors);
      } else if (node.additionalProperties === false) {
        errors.push(`${dataPath}: unexpected property "${key}" (not in schema, additionalProperties: false)`);
      } else if (node.additionalProperties && typeof node.additionalProperties === "object") {
        validate(schema, node.additionalProperties, data[key], `${dataPath}.${key}`, errors);
      }
    }
  }

  if (node.type === "array" && node.items) {
    data.forEach((item, i) => validate(schema, node.items, item, `${dataPath}[${i}]`, errors));
  }
}

function validateFile(filePath, schema) {
  const raw = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return [`Not valid JSON: ${error.message}`];
  }
  const errors = [];
  validate(schema, schema, data, "$", errors);
  return errors;
}

function main() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const targets = process.argv.slice(2);
  if (targets.length === 0) targets.push(path.join(repoRoot, "security.json"));

  let anyErrors = false;
  for (const target of targets) {
    const errors = validateFile(target, schema);
    if (errors.length === 0) {
      console.log(`${target}: valid`);
    } else {
      anyErrors = true;
      console.error(`${target}: INVALID`);
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  if (anyErrors) process.exit(1);
}

main();
