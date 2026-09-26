(() => {
  // Renders the #security section's "Applications" table from
  // security/inventory.json (built by scripts/generate-security-inventory.js).
  // MarinOS-specific — not part of shared/app-shell.js, since no other
  // consumer app needs a cross-app inventory table. Lazy-loads the same way
  // shared/app-shell.js's Updates/per-app-Security features do: only once
  // #security actually becomes visible, watching its `hidden` attribute.
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

  function rowFor(app) {
    const name = escapeHtml(app.name);
    const nameCell = `<a href="${escapeHtml(app.url)}">${name}</a>`;
    if (app.status !== "configured") {
      return `<tr><td>${nameCell}</td><td colspan="2">Not yet configured</td><td>&mdash;</td></tr>`;
    }
    // MarinOS's own row links to the section already on this page rather
    // than round-tripping through its own public URL.
    const securityUrl = app.id === "marin-os" ? "#security" : `${app.url}#security`;
    const profileLabel = PROFILE_LABELS[app.profile] || app.profile || "Not set";
    return (
      `<tr><td>${nameCell}</td>` +
      `<td>${escapeHtml(profileLabel)}</td>` +
      `<td>${escapeHtml(app.lastReviewed || "Unknown")}</td>` +
      `<td><a href="${escapeHtml(securityUrl)}">Security</a></td></tr>`
    );
  }

  let loaded = false;
  async function loadInventory() {
    if (loaded) return;
    status.textContent = "Loading application security inventory...";
    try {
      const response = await fetch("security/inventory.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`inventory fetch failed: ${response.status}`);
      const inventory = await response.json();
      loaded = true;
      tbody.innerHTML = (inventory.apps || []).map(rowFor).join("");
      table.hidden = false;
      status.textContent = inventory.generatedAt
        ? `Last generated ${new Date(inventory.generatedAt).toLocaleString()}.`
        : "";
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
