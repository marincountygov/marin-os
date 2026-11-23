(() => {
  // Renders the #security section's "Applications" table live: catalog.json
  // (same-origin) gives the list of apps, then each app's own security.json
  // is read straight from its Pages site (GitHub Pages serves
  // access-control-allow-origin: *). Nothing is generated or committed, so
  // the table can't go stale — each app stays the single source of truth for
  // its own security information. MarinOS-specific, so it lives here and not
  // in vendor/marinos/marinos.js. Lazy-loads once #security becomes visible, the
  // same way vendor/marinos/marinos.js's Updates and per-app Security features do.
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
    status.textContent = "Loading MarinOS…";
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
  // the data-status values vendor/marinos/marinos.css's .app-status rules support.
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
    status.textContent = "Loading MarinOS…";
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
  // vendor/marinos/marinos.js.
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
    });
    applyFilter();
  }

  // Arrow keys / Home / End and the one-tab-stop behavior come from the shared
  // shell (any [role="tablist"]); a click is all this needs to handle.
  tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab)));

  let loaded = false;
  async function loadProjects() {
    if (loaded) return;
    status.textContent = "Loading MarinOS…";
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
    // The shared App Shell gauge (vendor/marinos/marinos.js): ring, number, and the
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
    status.textContent = "Loading MarinOS…";
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

(() => {
  // Renders the #tech section's portfolio table live from data/tech.json
  // (written by scripts/tech.js). Names and URLs come from catalog.json;
  // results are joined by catalog id. Missing data is never shown as zero or
  // "No": it reads "Not available", and an AI declaration that was never made
  // reads "Not documented". The platform's own detail block below the table is
  // filled by the App Shell.
  const section = document.querySelector("#tech");
  const status = document.querySelector("[data-tech-summary-status]");
  const table = document.querySelector("[data-tech-table]");
  const tbody = document.querySelector("[data-tech-body]");
  if (!section || !status || !table || !tbody) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function languages(entry) {
    const langs = entry && entry.languages;
    const data = langs && (langs.status === "success" ? langs : langs.lastSuccess);
    if (data && data.percentages) return escapeHtml(Object.keys(data.percentages).slice(0, 3).join(", "));
    return langs && langs.status === "none-detected" ? "None detected" : "Not available";
  }

  function dependencies(entry) {
    const deps = entry && entry.dependencies;
    return deps && deps.status === "success" ? String(deps.total) : "Not available";
  }

  function ai(entry) {
    const declared = entry && entry.ai;
    let label = "AI: Not documented";
    if (declared && declared.status === "documented") label = declared.used ? "AI: Yes" : "AI: No";
    else if (declared && declared.status === "unavailable") label = "AI: Not available";
    return `<span class="app-badge">${label}</span>`;
  }

  function rowFor(app, entry) {
    // Components (Marin App Shell, Marin UI) have their details further down this page.
    const href = app.component ? `#tech-${app.id}` : app.self ? "#tech" : new URL("#tech", app.url).href;
    return (
      `<tr><td><a href="${escapeHtml(href)}">${escapeHtml(app.name)}</a></td>` +
      `<td>${languages(entry)}</td><td>${dependencies(entry)}</td><td>${ai(entry)}</td></tr>`
    );
  }

  let loaded = false;
  async function loadTech() {
    if (loaded) return;
    status.textContent = "Loading MarinOS…";
    try {
      const [catalogResponse, dataResponse] = await Promise.all([
        fetch("catalog.json", { cache: "no-store" }),
        fetch("data/tech.json", { cache: "no-store" }),
      ]);
      if (!catalogResponse.ok) throw new Error(`catalog fetch failed: ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      // 404 is a real, expected state: nothing has been collected yet.
      const data = dataResponse.ok ? await dataResponse.json() : null;
      if (!dataResponse.ok && dataResponse.status !== 404) throw new Error(`tech fetch failed: ${dataResponse.status}`);

      // MarinOS is in scope but doesn't list itself in its own catalog.
      const components = Object.entries((data && data.apps) || {})
        .filter(([, entry]) => entry && entry.kind === "component")
        .map(([id, entry]) => ({ id, name: entry.name || id, component: true }));
      const apps = [{ id: "marin-os", name: "MarinOS", url: "./", self: true }, ...catalog, ...components];
      loaded = true;
      tbody.innerHTML = apps.map((app) => rowFor(app, data && data.apps && data.apps[app.id])).join("");
      table.hidden = false;
      status.textContent = data ? "" : "Technology information hasn't been collected yet.";
    } catch (error) {
      loaded = true;
      console.error(error);
      status.textContent = "Unable to retrieve technology information right now.";
    }
  }

  if (!section.hidden) loadTech();

  new MutationObserver(() => {
    if (!section.hidden) loadTech();
  }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
})();

// The search box on the MarinOS home page: type a word, see the apps, the pages of MarinOS and the projects that have it, grouped by kind.
// It is plain on purpose. Lower case, accents ignored, every word typed must match the start of a word in a name, an other name or a description.
// The apps come from catalog.json and the projects from projects.json (the same files the page already reads); the pages are the tabs of this page.
// Without JavaScript the box stays hidden and the grid of apps is all there is.
(() => {
  const box = document.getElementById("home-search");
  const input = document.getElementById("home-search-input");
  const statusEl = document.getElementById("home-search-status");
  const resultsEl = document.getElementById("home-search-results");
  const grid = document.querySelector(".directory-grid");
  if (!box || !input || !statusEl || !resultsEl || !grid) return;
  box.hidden = false;

  const KINDS = ["App", "MarinOS page", "Organization", "Program", "Place", "Service", "Person", "Project"];
  const PLURAL = { App: "Apps", "MarinOS page": "MarinOS pages", Organization: "Organizations", Program: "Programs", Place: "Places", Service: "Services", Person: "People", Project: "Projects" };
  const SHOWN = 60; // the most results listed; the count says how many there are
  const plain = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = (text) => plain(text).split(/[^a-z0-9]+/).filter(Boolean);
  const clip = (text, n = 160) => { const t = String(text || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

  let entries = null;
  let loading = null;

  // ---- what can be found ----
  const fromPages = () => {
    const found = [];
    document.querySelectorAll("section[data-tab-section]").forEach((section) => {
      if (!section.id) return;
      const heading = section.querySelector("h2");
      const first = section.querySelector("p");
      if (heading) found.push({ k: "MarinOS page", n: heading.textContent.trim(), d: clip(first ? first.textContent : ""), a: "", h: `#${section.id}` });
    });
    // What Alpha, Beta and Live mean.
    const status = document.getElementById("status");
    if (status) {
      status.querySelectorAll("h3").forEach((h3) => {
        const name = h3.textContent.trim();
        if (!/^(alpha|beta|live)$/i.test(name)) return;
        const line = h3.nextElementSibling;
        found.push({ k: "MarinOS page", n: `${name} status`, d: clip(line ? line.textContent.replace(/^\s*\S+\s*[—-]\s*/, "") : ""), a: name, h: "#status" });
      });
    }
    return found;
  };
  const fromCatalog = (catalog) => catalog.map((app) => ({ k: "App", n: app.name, d: clip(app.description), a: [app.id, app.owner].filter(Boolean).join(" "), h: app.url, status: app.status }));
  // A project of an app is the app itself: it is listed once, as the app.
  const fromProjects = (projects, appUrls) => projects.filter((p) => !appUrls.has(String(p.url || "").replace(/\/$/, ""))).map((p) => ({ k: "Project", n: p.name, d: clip(p.description), a: (p.phase && p.phase.name) || "", h: p.url || "#projects" }));
  // The County's organizations, programs, places, services and people: one list that marin-data builds (data/search-index.json), opened on their pages in Marin Pulse.
  const fromData = (doc) => {
    if (!doc || !Array.isArray(doc.entries)) return [];
    const base = doc.base || "";
    return doc.entries.map((e) => ({ k: e.k, n: e.n, d: e.d || "", a: (e.a || []).join(" "), alts: e.a || [], c: e.c || "", h: /^https?:/.test(e.h) ? e.h : base + e.h }));
  };
  const read = (url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const load = () => {
    if (!loading) {
      loading = Promise.all([read("catalog.json"), read("projects.json"), read("external-projects.json"), read("data/search-index.json")]).then(([catalog, projects, external, data]) => {
        const apps = fromCatalog(Array.isArray(catalog) ? catalog : []);
        const appUrls = new Set(apps.map((a) => String(a.h).replace(/\/$/, "")));
        const all = [...apps, ...fromPages(), ...fromData(data), ...fromProjects([...(Array.isArray(projects) ? projects : []), ...(Array.isArray(external) ? external : [])], appUrls)];
        entries = all.map((e) => ({ ...e, nw: words(e.n), aw: words(e.a), dw: words(e.d), name: plain(e.n), code: plain(e.c), alt: (e.alts || []).map(plain) }));
      });
    }
    return loading;
  };

  // ---- the match: every word typed starts a word of the name, the other names or the description ----
  const starts = (list, word) => list.some((w) => w.startsWith(word));
  const score = (e, typed, q) => {
    let total = 0;
    for (const word of typed) {
      if (starts(e.nw, word)) total += 3;
      else if (starts(e.aw, word)) total += 2;
      else if (e.code && e.code === word) total += 3; // a code is matched whole
      else if (starts(e.dw, word)) total += 1;
      else return 0;
    }
    if (e.code && e.code === q) total += 100; // the code, exactly
    if (e.alt && e.alt.some((x) => x === q || x === `marin ${q}` || x === `marin county ${q}`)) total += 50; // another name for it, exactly (HHS, Marin HHS)
    if (e.name === q) total += 100; // the name, exactly
    else if (e.name.startsWith(q)) total += 20; // a name that starts with what was typed
    return total;
  };

  // ---- the page ----
  const line = (count, q) => {
    const root = document.createElement("span");
    root.className = "results-line";
    root.append(Object.assign(document.createElement("span"), { className: "results-line__count", textContent: `${count.toLocaleString("en-US")} ${count === 1 ? "result" : "results"}` }));
    root.append(Object.assign(document.createElement("span"), { className: "results-line__slash", textContent: " / " }), Object.assign(document.createElement("span"), { className: "results-line__filters", textContent: `matching “${q}”` }));
    return root;
  };
  const badge = (status) => {
    if (!["alpha", "beta", "live"].includes(status)) return null;
    const span = Object.assign(document.createElement("span"), { className: "app-status", textContent: status.charAt(0).toUpperCase() + status.slice(1) });
    span.dataset.status = status;
    return span;
  };
  const item = (e) => {
    const li = document.createElement("li");
    const a = Object.assign(document.createElement("a"), { href: e.h, textContent: e.n });
    li.append(a);
    if (e.c) li.append(" ", Object.assign(document.createElement("span"), { textContent: `(${e.c})` }));
    const b = e.k === "App" ? badge(e.status) : null;
    if (b) li.append(" ", b);
    if (e.d) li.append(" ", Object.assign(document.createElement("span"), { className: "home-search__what", textContent: e.d }));
    return li;
  };
  const clear = () => { resultsEl.replaceChildren(); statusEl.replaceChildren(); grid.hidden = false; };
  const run = () => {
    const q = plain(input.value).trim().replace(/\s+/g, " ");
    if (!q) { clear(); return; }
    load().then(() => {
      if (plain(input.value).trim().replace(/\s+/g, " ") !== q) return; // the box has changed since
      const typed = q.split(" ");
      const scored = entries.map((e) => [e, score(e, typed, q)]).filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1] || KINDS.indexOf(a[0].k) - KINDS.indexOf(b[0].k) || a[0].n.localeCompare(b[0].n, "en", { sensitivity: "base" }));
      const found = scored.map(([e]) => e);
      const best = new Map(); // the best score in each kind
      scored.forEach(([e, s]) => { if (!best.has(e.k)) best.set(e.k, s); });
      grid.hidden = true;
      statusEl.replaceChildren(line(found.length, input.value.trim()));
      // Grouped by kind, the group with the best match first, each with its count.
      const sizes = new Map();
      found.forEach((e) => sizes.set(e.k, (sizes.get(e.k) || 0) + 1));
      const groups = new Map();
      found.slice(0, SHOWN).forEach((e) => groups.set(e.k, [...(groups.get(e.k) || []), e]));
      resultsEl.replaceChildren(...[...groups].sort((a, b) => best.get(b[0]) - best.get(a[0]) || sizes.get(b[0]) - sizes.get(a[0]) || KINDS.indexOf(a[0]) - KINDS.indexOf(b[0])).map(([kind, list]) => {
        const group = document.createElement("section");
        group.className = "home-search__group";
        const title = `${PLURAL[kind] || kind} (${sizes.get(kind)})`;
        const ul = document.createElement("ul");
        ul.append(...list.map(item));
        group.append(Object.assign(document.createElement("h3"), { textContent: title }), ul);
        return group;
      }));
      if (!found.length) resultsEl.append(Object.assign(document.createElement("p"), { innerHTML: '<a href="#">All apps</a>' }));
      const none = resultsEl.querySelector("p a");
      if (none) none.addEventListener("click", (event) => { event.preventDefault(); input.value = ""; clear(); input.focus(); });
    });
  };

  input.addEventListener("focus", load);
  input.addEventListener("input", run);
  // Enter opens the first result; Down moves into the list; Escape empties the box.
  const links = () => [...resultsEl.querySelectorAll("li a")];
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { const first = links()[0]; if (first) { event.preventDefault(); first.click(); } }
    else if (event.key === "ArrowDown") { const first = links()[0]; if (first) { event.preventDefault(); first.focus(); } }
    else if (event.key === "Escape") { input.value = ""; clear(); }
  });
  resultsEl.addEventListener("keydown", (event) => {
    const all = links();
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    if (event.key === "ArrowDown" && at < all.length - 1) { event.preventDefault(); all[at + 1].focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); (at ? all[at - 1] : input).focus(); }
    else if (event.key === "Escape") { input.focus(); }
  });
})();
