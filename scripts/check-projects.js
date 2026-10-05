#!/usr/bin/env node
// Validates projects.json (MarinOS projects) and external-projects.json
// (everyone else's) — both are arrays of schemaGov Project records:
// https://schema.govfresh.com/profiles/projects/
// No dependencies — this repo has no build step and this check shouldn't add one.
//
// Also confirms every app in catalog.json has a matching projects.json entry
// (same name, url, and phase), so the two can't drift.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));

// schemaGov ProjectStatus codes (profiles/projects/codelists/project-status.json).
const PROJECT_STATUSES = ["proposed", "planned", "active", "paused", "completed", "cancelled"];
// schemaGov DigitalServicePhase codes (profiles/projects/codelists/digital-service-phase.json).
const PHASES = ["discovery", "alpha", "beta", "private-beta", "public-beta", "live", "retired"];
// Not a schemaGov field — a local addition. Who the project is for. Differs
// from catalog.json's own "audience" values (staff/public) on purpose.
const AUDIENCES = ["internal", "external"];
const PHASE_BASE = "https://schema.govfresh.com/v1/dsphase/";

function checkReference(label, reference, errors) {
  if (!reference || !reference["@id"] || !reference.name) {
    errors.push(`${label} needs both "@id" and "name" (the table shows the name).`);
  }
}

function checkFile(file, errors) {
  const projects = read(file);
  if (!Array.isArray(projects)) {
    errors.push(`${file} must be an array of Project records.`);
    return [];
  }
  projects.forEach((project, i) => {
    const label = `${file} "${project["@id"] || project.name || `entry ${i}`}"`;
    if (project["@type"] !== "Project") errors.push(`${label} must have "@type": "Project".`);
    for (const field of ["@id", "name"]) {
      if (!project[field]) errors.push(`${label} is missing required field "${field}".`);
    }
    if (project.status !== undefined && !PROJECT_STATUSES.includes(project.status)) {
      errors.push(`${label} has status "${project.status}", which isn't one of: ${PROJECT_STATUSES.join(", ")}.`);
    }
    if (project.phase) {
      const id = String(project.phase["@id"] || "");
      const code = id.slice(PHASE_BASE.length);
      if (!id.startsWith(PHASE_BASE) || !PHASES.includes(code)) {
        errors.push(`${label} has a phase "@id" that isn't a ${PHASE_BASE}<code> term (${PHASES.join(", ")}).`);
      }
      if (!project.phase.name) errors.push(`${label} phase needs a "name".`);
    }
    if (!Array.isArray(project.audience) || !project.audience.length || !project.audience.every((a) => AUDIENCES.includes(a))) {
      errors.push(`${label} needs "audience": a non-empty array of ${AUDIENCES.join(", ")}.`);
    }
    if (project.parentOrganization) checkReference(`${label} parentOrganization`, project.parentOrganization, errors);
    (project.member || []).forEach((m) => checkReference(`${label} member`, m, errors));
  });
  return projects;
}

function main() {
  const errors = [];
  const marinos = checkFile("projects.json", errors);
  const external = checkFile("external-projects.json", errors);

  const seen = new Set();
  for (const project of [...marinos, ...external]) {
    if (!project["@id"]) continue;
    if (seen.has(project["@id"])) errors.push(`Duplicate project "@id": ${project["@id"]}.`);
    seen.add(project["@id"]);
  }

  for (const app of read("catalog.json")) {
    const project = marinos.find((p) => p.url === app.url);
    if (!project) {
      errors.push(`catalog.json has "${app.name}" (${app.url}) but projects.json has no project with that url.`);
      continue;
    }
    if (project.name !== app.name) {
      errors.push(`"${app.url}": catalog.json name is "${app.name}" but projects.json name is "${project.name}".`);
    }
    const code = String((project.phase && project.phase["@id"]) || "").slice(PHASE_BASE.length);
    if (code !== app.status) {
      errors.push(`"${app.url}": catalog.json status is "${app.status}" but projects.json phase is "${code || "(missing)"}".`);
    }
  }

  if (errors.length > 0) {
    console.error("projects.json / external-projects.json have problems:\n");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`projects.json (${marinos.length}) and external-projects.json (${external.length}) are valid.`);
}

main();
