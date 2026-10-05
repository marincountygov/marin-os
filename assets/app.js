(() => {
  // MarinOS's own status — shown in two places on this page (the banner
  // toggle and this page's own <h1>), and they used to be two separately
  // hardcoded badges that had already drifted apart (banner said Alpha,
  // title said Live). MarinOS doesn't list itself in its own catalog.json
  // (see the #security/#status inventory loaders below, which both inject
  // a synthetic self-entry for the same reason), so there's no catalog
  // value for shared/app-shell.js's generic renderOwnStatusBadge() to find
  // for this page specifically — this constant is that single source
  // instead, for just this one self-referential case. Change it here only;
  // every [data-marinos-own-status] element on this page reads from it.
  const MARINOS_OWN_STATUS = "beta";
  const MARINOS_OWN_STATUS_LABELS = { alpha: "Alpha", beta: "Beta", live: "Live" };
  const ownStatusLabel = MARINOS_OWN_STATUS_LABELS[MARINOS_OWN_STATUS];
  if (ownStatusLabel) {
    document.querySelectorAll("[data-marinos-own-status]").forEach((el) => {
      el.dataset.status = MARINOS_OWN_STATUS;
      el.textContent = ownStatusLabel;
    });
  }
})();

(() => {
  // Renders the #security section's "Applications" table live: catalog.json
  // (same-origin) gives the list of apps, then each app's own security.json
  // is read straight from its Pages site (GitHub Pages serves
  // access-control-allow-origin: *). Nothing is generated or committed, so
  // the table can't go stale — each app stays the single source of truth for
  // its own security information. MarinOS-specific, so it lives here and not
  // in shared/app-shell.js. Lazy-loads once #security becomes visible, the
  // same way shared/app-shell.js's Updates and per-app Security features do.
  const section = document.querySelector("#security");
  const status = document.querySelector("[data-inventory-status]");
  const table = document.querySelector("[data-inventory-table]");
  const tbody = document.querySelector("[data-inventory-body]");
  if (!section || !status || !table || !tbody) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PROFILE_LABELS = {
    "public-web": "Public web",
    "public-api": "Public API",
    authenticated: "Authenticated",
    internal: "Internal",
    custom: "Custom",
  };

  // 404 means "no security.json yet" (a real, expected state); anything else
  // that fails is "couldn't check", which is a different claim and is shown
  // as such rather than being reported as unconfigured.
  async function readSecurity(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.status === 404) return { state: "missing" };
      if (!response.ok) return { state: "unavailable" };
      const config = await response.json();
      return {
        state: "configured",
        profile: config.profile,
        lastReviewed: config.review && config.review.lastReviewed,
      };
    } catch {
      return { state: "unavailable" };
    }
  }

  function rowFor(app, result) {
    const nameCell = `<a href="${escapeHtml(app.url)}">${escapeHtml(app.name)}</a>`;
    if (result.state === "missing") {
      return `<tr><td>${nameCell}</td><td colspan="2">Not yet configured</td><td>&mdash;</td></tr>`;
    }
    if (result.state === "unavailable") {
      return `<tr><td>${nameCell}</td><td colspan="2">Couldn't check right now</td><td>&mdash;</td></tr>`;
    }
    // MarinOS's own row links to the section already on this page.
    const securityUrl = app.self ? "#security" : new URL("#security", app.url).href;
    const profileLabel = PROFILE_LABELS[result.profile] || result.profile || "Not set";
    return (
      `<tr><td>${nameCell}</td>` +
      `<td>${escapeHtml(profileLabel)}</td>` +
      `<td>${escapeHtml(result.lastReviewed || "Unknown")}</td>` +
      `<td><a href="${escapeHtml(securityUrl)}">Security</a></td></tr>`
    );
  }

  let loaded = false;
  async function loadInventory() {
    if (loaded) return;
    status.textContent = "Loading application security inventory...";
    try {
      const response = await fetch("catalog.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`catalog fetch failed: ${response.status}`);
      const catalog = await response.json();

      // MarinOS is in scope but doesn't list itself in its own catalog.
      const apps = [{ id: "marin-os", name: "MarinOS", url: "./", self: true }, ...catalog];
      const results = await Promise.all(
        apps.map((app) => readSecurity(app.self ? "security.json" : new URL("security.json", app.url).href))
      );

      loaded = true;
      tbody.innerHTML = apps.map((app, i) => rowFor(app, results[i])).join("");
      table.hidden = false;
      status.textContent = "Read live from each application's own security information.";
    } catch (error) {
      loaded = true;
      console.error(error);
      status.textContent = "Couldn't load the application security inventory right now.";
    }
  }

  if (!section.hidden) loadInventory();

  new MutationObserver(() => {
    if (!section.hidden) loadInventory();
  }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
})();

(() => {
  // Renders the #status section's "App status" table live: catalog.json
  // (same-origin) already has every app's current status, so unlike the
  // Security table above, no per-app fetch is needed — one request covers
  // the whole table. MarinOS doesn't list itself in its own catalog.json
  // (same as the Security table's own comment notes), so it isn't a row
  // here either — this table is exactly "every app in catalog.json."
  const section = document.querySelector("#status");
  const status = document.querySelector("[data-status-inventory-status]");
  const table = document.querySelector("[data-status-inventory-table]");
  const tbody = document.querySelector("[data-status-inventory-body]");
  if (!section || !status || !table || !tbody) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // The one place the badge's visible label text is set — must match the
  // Alpha/Beta/Live headings hand-authored above in this same section, and
  // the data-status values shared/app-brand.css's .app-status rules support.
  const STATUS_LABELS = { alpha: "Alpha", beta: "Beta", live: "Live" };

  function renderStatusBadge(appStatus) {
    const label = STATUS_LABELS[appStatus] || appStatus;
    return `<span class="app-status" data-status="${escapeHtml(appStatus)}">${escapeHtml(label)}</span>`;
  }

  function rowFor(app) {
    const nameCell = `<a href="${escapeHtml(app.url)}">${escapeHtml(app.name)}</a>`;
    return (
      `<tr><td>${nameCell}</td>` +
      `<td>${renderStatusBadge(app.status)}</td>` +
      `<td>${escapeHtml(app.description || "")}</td></tr>`
    );
  }

  let loaded = false;
  async function loadInventory() {
    if (loaded) return;
    status.textContent = "Loading application status inventory...";
    try {
      const response = await fetch("catalog.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`catalog fetch failed: ${response.status}`);
      const catalog = await response.json();

      loaded = true;
      tbody.innerHTML = catalog.map(rowFor).join("");
      table.hidden = false;
      status.textContent = `${catalog.length} app${catalog.length === 1 ? "" : "s"}, read live from catalog.json.`;
    } catch (error) {
      loaded = true;
      console.error(error);
      status.textContent = "Couldn't load the application status inventory right now.";
    }
  }

  if (!section.hidden) loadInventory();

  new MutationObserver(() => {
    if (!section.hidden) loadInventory();
  }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
})();

(() => {
  // Renders the #projects section's table live from two schemaGov Project
  // files: projects.json (MarinOS's own projects) and external-projects.json
  // (everyone else's). Both are same-origin; one failing doesn't blank the
  // other. Status shows the project's digital service phase (`phase`), not
  // its active/inactive `status` field. Sorting needs no code here — the
  // header buttons and data-sort-* row attributes are handled generically by
  // shared/app-shell.js.
  const section = document.querySelector("#projects");
  const status = document.querySelector("[data-projects-status]");
  const table = document.querySelector("[data-projects-table]");
  const tbody = document.querySelector("[data-projects-body]");
  if (!section || !status || !table || !tbody) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PHASE_BADGES = ["alpha", "beta", "live"];
  const AUDIENCE_LABELS = { internal: "Internal", external: "External" };
  const EMPTY = "&mdash;";

  async function readProjects(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      const projects = await response.json();
      return Array.isArray(projects) ? projects : null;
    } catch {
      return null;
    }
  }

  function names(references) {
    return (Array.isArray(references) ? references : [references])
      .map((reference) => reference && reference.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .join(", ");
  }

  function rowFor(project) {
    const title = project.url
      ? `<a href="${escapeHtml(project.url)}">${escapeHtml(project.name)}</a>`
      : escapeHtml(project.name);
    const phaseName = (project.phase && project.phase.name) || "";
    const phaseCode = String((project.phase && project.phase["@id"]) || "").split("/").pop();
    const badge = !phaseName
      ? EMPTY
      : PHASE_BADGES.includes(phaseCode)
        ? `<span class="app-status" data-status="${phaseCode}">${escapeHtml(phaseName)}</span>`
        : escapeHtml(phaseName);
    const parent = names(project.parentOrganization);
    const members = names(project.member);
    const audience = (Array.isArray(project.audience) ? project.audience : [])
      .map((value) => AUDIENCE_LABELS[value] || value)
      .join(", ");
    return (
      `<tr data-project-status="${escapeHtml(project.status || "")}"` +
      ` data-sort-title="${escapeHtml(project.name)}"` +
      ` data-sort-status="${escapeHtml(phaseName)}"` +
      ` data-sort-parent="${escapeHtml(parent)}">` +
      `<td>${title}${project.description ? `<br>${escapeHtml(project.description)}` : ""}</td>` +
      `<td>${badge}</td>` +
      `<td>${parent ? escapeHtml(parent) : EMPTY}</td>` +
      `<td>${members ? escapeHtml(members) : EMPTY}</td>` +
      `<td>${audience ? escapeHtml(audience) : EMPTY}</td></tr>`
    );
  }

  // Status tabs filter by the project's ProjectStatus (schemaGov) by hiding
  // rows rather than re-rendering, so the table's current sort order is kept.
  const tabs = Array.from(document.querySelectorAll("[data-projects-tabs] [role=tab]"));
  let activeStatus = "all";
  let loadMessage = "";

  function applyFilter() {
    let shown = 0;
    tbody.querySelectorAll("tr").forEach((row) => {
      const match = activeStatus === "all" || row.dataset.projectStatus === activeStatus;
      row.hidden = !match;
      if (match) shown += 1;
    });
    table.hidden = !shown;
    status.textContent = loadMessage || (shown ? "" : "No projects with this status.");
  }

  function selectTab(tab) {
    activeStatus = tab.dataset.projectStatus;
    tabs.forEach((other) => {
      other.setAttribute("aria-selected", String(other === tab));
      other.tabIndex = other === tab ? 0 : -1;
    });
    applyFilter();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(i + step + tabs.length) % tabs.length];
      if (!step && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      next.focus();
      selectTab(next);
    });
  });

  let loaded = false;
  async function loadProjects() {
    if (loaded) return;
    status.textContent = "Loading projects...";
    const [marinos, external] = await Promise.all([
      readProjects("projects.json"),
      readProjects("external-projects.json"),
    ]);
    loaded = true;
    if (!marinos && !external) {
      status.textContent = "Couldn't load projects right now.";
      return;
    }
    // Alphabetical by title, matching the Title header's initial aria-sort.
    const projects = [...(marinos || []), ...(external || [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
    tbody.innerHTML = projects.map(rowFor).join("");
    loadMessage = !marinos || !external ? "Some projects couldn't be loaded right now." : "";
    applyFilter();
  }

  if (!section.hidden) loadProjects();

  new MutationObserver(() => {
    if (!section.hidden) loadProjects();
  }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
})();

(() => {
  // Renders the #accessibility section's score table live from
  // data/lighthouse.json (Google Lighthouse via the PageSpeed Insights API,
  // written by scripts/lighthouse.js). Names and URLs come from catalog.json;
  // results are joined by catalog id. Never labels a score as WCAG
  // conformance — it's automated testing only. A failed scan is shown as
  // "Not available", not as a low score, and keeps showing the last good
  // result (with its date) when there is one.
  const section = document.querySelector("#accessibility");
  const status = document.querySelector("[data-accessibility-status]");
  const table = document.querySelector("[data-accessibility-table]");
  const tbody = document.querySelector("[data-accessibility-body]");
  if (!section || !status || !table || !tbody) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const STALE_AFTER_DAYS = 14;
  const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // What to show for one app: { score, testedAt, note } — score is null when
  // there's nothing trustworthy to show.
  function describe(entry) {
    if (!entry) return { score: null };
    const good =
      entry.status === "success"
        ? { score: entry.score, testedAt: entry.testedAt }
        : entry.lastSuccess || null;
    if (!good) return { score: null };
    let note = "";
    if (entry.status !== "success") note = "latest scan didn't finish";
    else if (Date.now() - new Date(good.testedAt).getTime() > STALE_AFTER_DAYS * 86400000) note = "out of date";
    return { ...good, note };
  }

  function rowFor(app, entry) {
    const href = app.self ? "#accessibility" : new URL("#accessibility", app.url).href;
    const nameCell = `<a href="${escapeHtml(href)}">${escapeHtml(app.name)}</a>`;
    const result = describe(entry);
    if (result.score === null) return `<tr><td>${nameCell}</td><td>Not available</td><td>&mdash;</td></tr>`;
    const tested = escapeHtml(formatDate(result.testedAt)) + (result.note ? ` (${escapeHtml(result.note)})` : "");
    // The shared gauge (marin-ui, shared/app-shell.js): ring, number, and the
    // band word, so color is never the only signal.
    const gauge = window.marinScoreGauge ? window.marinScoreGauge(result.score).outerHTML : `${escapeHtml(result.score)} / 100`;
    // PageSpeed Insights' own results page for the same address, mobile —
    // a live re-run of the test, so it can differ slightly from the stored score.
    const reportUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent((entry && entry.url) || (app.self ? "https://marincountygov.github.io/marin-os/" : app.url))}&form_factor=mobile`;
    const report = ` <a href="${escapeHtml(reportUrl)}" target="_blank" rel="noreferrer">Lighthouse results</a>`;
    return `<tr><td>${nameCell}</td><td>${gauge}${report}</td><td>${tested}</td></tr>`;
  }

  let loaded = false;
  async function loadScores() {
    if (loaded) return;
    status.textContent = "Loading accessibility scores...";
    try {
      const [catalogResponse, dataResponse] = await Promise.all([
        fetch("catalog.json", { cache: "no-store" }),
        fetch("data/lighthouse.json", { cache: "no-store" }),
      ]);
      if (!catalogResponse.ok) throw new Error(`catalog fetch failed: ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      // 404 is a real, expected state: no scan has run yet.
      const data = dataResponse.ok ? await dataResponse.json() : null;
      if (!dataResponse.ok && dataResponse.status !== 404) throw new Error(`scores fetch failed: ${dataResponse.status}`);

      // MarinOS is in scope but doesn't list itself in its own catalog.
      const apps = [{ id: "marin-os", name: "MarinOS", url: "./", self: true }, ...catalog];
      loaded = true;
      tbody.innerHTML = apps.map((app) => rowFor(app, data && data.apps && data.apps[app.id])).join("");
      table.hidden = false;
      status.textContent = data ? "" : "Scores haven't been collected yet.";
    } catch (error) {
      loaded = true;
      console.error(error);
      status.textContent = "Couldn't load accessibility scores right now.";
    }
  }

  if (!section.hidden) loadScores();

  new MutationObserver(() => {
    if (!section.hidden) loadScores();
  }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
})();
