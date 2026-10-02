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
