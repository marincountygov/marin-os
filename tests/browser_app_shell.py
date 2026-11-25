#!/usr/bin/env python3
"""Test the real MarinOS integration, or explicitly limited in-memory fixtures.

Default: real localhost HTTP and real static asset loading. External APIs are fixtures.
--fixtures: no navigation/network; inject source CSS/JS and local fonts into memory.
This second mode does not establish deferred-script timing or HTTP correctness.
"""
from __future__ import annotations

import argparse
import base64
import functools
import json
import os
from pathlib import Path
import re
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, urlsplit

from playwright.sync_api import Page, sync_playwright

from html_fixture import remove_from_html

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "catalog.json").read_text())
LISTED = [c for c in CATALOG if not c.get("unlisted")]  # an unlisted app has no card and is left out of every list on the page
FEATURED = sorted((c for c in LISTED if "featured" in c), key=lambda c: c["featured"])
MANIFEST = json.loads((ROOT / "vendor/marinos/manifest.json").read_text())
VERSION = MANIFEST["shellVersion"]
project_block = re.search(r"^project:([^\0]*?)(?=^\S|\Z)", (ROOT / "marin.yml").read_text(), re.M)[1]
PROJECT_STATUS = re.search(r"^  status:\s*(alpha|beta|live)\s*$", project_block, re.M)[1]
STATUS_LABEL = {"alpha": "Alpha", "beta": "Beta", "live": "Live"}[PROJECT_STATUS]
ROUTES = ["projects", "status", "about", "security", "accessibility", "updates"]
LABELS = ["Projects", "Status", "About", "Security", "Accessibility", "Tech", "Updates"]
COMMITS = [{
    "html_url": "https://github.com/marincountygov/marin-os/commit/test-fixture",
    "commit": {"message": "fix: fixture update\n\n- Test-only release note.",
               "committer": {"date": "2026-10-05T12:00:00Z"}},
}]


def require(value, message: str) -> None:
    if not value:
        raise AssertionError(message)


# Marin Docs publishes a list of its own content (searchIndex in its catalog entry) and a text file for each set. Small stand-ins,
# so the test needs no network: one regulation section, with the text a result shows a line of.
DOCS_INDEX = {"schemaVersion": "1.0.0", "base": "https://marincountygov.github.io/marin-docs/",
              "sets": [{"src": "pmrs/search.json", "kind": "PMR"}], "entries": [
                  {"k": "PMR", "n": "PMR 24: Grievance Procedure", "d": "Grievances.", "h": "pmrs/pmr-24.html"}]}
DOCS_PMR_SET = [{"n": "PMR 24.3 Formal Grievance", "p": "PMR 24: Grievance Procedure", "h": "pmr-24.html#24-3",
                 "t": "A. Grievance Form. If the grievant believes that the informal grievance has not been redressed within 14 calendar days, he or she may initiate a formal grievance within seven calendar days."}]
# Marin Census publishes a list of its places and measures (searchIndex in its catalog entry). A small stand-in.
CENSUS_INDEX = {"schemaVersion": "1.0.0", "base": "https://marincountygov.github.io/marin-census/", "entries": [
    {"k": "Statistic", "n": "Median household income", "d": "Income and poverty", "h": "#data"},
    {"k": "Statistic", "n": "Novato", "d": "City or town", "h": "?place=novato"}]}


def fixtures() -> dict:
    data = {}
    for name in ["marin.yml", "catalog.json", "projects.json", "external-projects.json",
                 "security.json", "data/lighthouse.json"]:
        data[name] = {"status": 200, "body": (ROOT / name).read_text(encoding="utf-8")}
    data["__commits__"] = {"status": 200, "body": json.dumps(COMMITS)}
    data["marin-docs/search-index.json"] = {"status": 200, "body": json.dumps(DOCS_INDEX)}
    data["marin-docs/pmrs/search.json"] = {"status": 200, "body": json.dumps(DOCS_PMR_SET)}
    data["marin-census/search-index.json"] = {"status": 200, "body": json.dumps(CENSUS_INDEX)}
    return data


FETCH_FIXTURE = r"""data => {
  window.__fixtureRequests = [];
  window.fetch = async function(input) {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, 'https://example.test/marin-os/');
    window.__fixtureRequests.push(url.href);
    let key = Object.keys(data).filter(k => !k.startsWith('__'))
      .sort((a,b) => b.length-a.length).find(k => url.pathname.endsWith('/' + k));
    if (url.hostname === 'api.github.com' && url.pathname.endsWith('/commits')) key = '__commits__';
    if (!key) throw new Error('Unexpected test fetch: ' + url.href);
    const result = data[key];
    return new Response(result.body, {status:result.status,
      headers:{'Content-Type': key.endsWith('.yml') ? 'text/plain' : 'application/json'}});
  };
}"""


def fixture_css() -> str:
    css = (ROOT / "vendor/marinos/marinos.css").read_text()
    for relative in MANIFEST["fontPathContract"]:
        font = (ROOT / "vendor/marinos" / relative).resolve()
        mime = "font/woff2" if font.suffix == ".woff2" else "font/ttf"
        data = base64.b64encode(font.read_bytes()).decode("ascii")
        css = css.replace(f'url("{relative}")', f'url("data:{mime};base64,{data}")')
    # Encoded bytes exist only in the test browser; no font payload is generated
    # into app CSS, distribution files, or committed test artifacts.
    return css + "\n" + (ROOT / "assets/app.css").read_text()


def inject_styles(page: Page) -> None:
    page.add_style_tag(content=fixture_css())


def ready(page: Page) -> None:
    page.wait_for_function("v => window.MarinAppShell?.version === v", arg=VERSION)
    page.locator('.app-title__status[data-marinos-status="manifest"]').wait_for()
    page.evaluate("document.fonts.ready")


def visible_route(page: Page, name: str) -> None:
    page.wait_for_function("name => { const s=[...document.querySelectorAll('[data-tab-section]')];"
                           "return s.filter(x=>!x.hidden).length === 1 && "
                           "s.every(x=>x.hidden === (x.dataset.tabSection!==name)); }", arg=name)


def goto_route(page: Page, name: str) -> None:
    page.locator(f'.app-footer__nav a[href="#{name}"]').click()
    visible_route(page, name)


def no_overflow(page: Page, where: str) -> None:
    require(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
            f"Page overflows horizontally: {where}")


def check_fonts(page: Page) -> None:
    require(page.locator("body").evaluate("el=>getComputedStyle(el).fontFamily").split(",")[0].strip(' \"') == "Open Sans", "Body font must be Open Sans")
    require(page.locator(".app-title").evaluate("el=>getComputedStyle(el).fontFamily").split(",")[0].strip(' \"') == "Jost", "Title font must be Jost")
    session = page.context.new_cdp_session(page)
    try:
        session.send("DOM.enable")
        session.send("CSS.enable")
        document = session.send("DOM.getDocument")["root"]["nodeId"]
        for selector, family in [(".app-title__link", "Jost"), (".directory-card p", "OpenSans")]:
            node = session.send("DOM.querySelector", {"nodeId": document, "selector": selector})["nodeId"]
            fonts = session.send("CSS.getPlatformFontsForNode", {"nodeId": node})["fonts"]
            require(any(f["isCustomFont"] and f["glyphCount"] > 0 and family.lower() in f["familyName"].replace(" ", "").lower() for f in fonts), f"Required font did not actually render: {selector}: {fonts}")
    finally:
        session.detach()


def check_structure(page: Page, width: int, scheme: str) -> None:
    visible_route(page, "directory")
    require(page.locator("#home-apps .directory-card").count() == len(FEATURED), "The Apps section must show only the featured apps")
    require(page.locator("#home-apps .directory-card h3 a").all_text_contents() == [c["name"] for c in FEATURED], "Featured apps are out of order")
    require(page.locator("#home-apps h2").inner_text() == "Apps" and page.locator("#home-apps a[href='#apps']").inner_text() == "All apps", "The Apps section needs its heading and the All apps link")
    require(page.locator(".app-badge").count() == 0, "Cards show the status only, with no Featured badge")
    require(all(c["name"] != "Marin Reach" for c in LISTED) and page.locator(".directory-card", has_text="Marin Reach").count() == 0, "An unlisted app has no card")
    require(page.locator("#app-nav a").count() == 0, "The header holds only the app's own tabs: no About or Updates")
    require(not page.locator("#menu-toggle").is_visible() and not page.locator("#app-nav").is_visible(), "MarinOS has no tabs, so no Menu button")
    require(page.locator("#app-nav a[href='#security']").count() == 0, "Security must not be in header")
    require(page.locator(".app-footer__nav a").all_text_contents() == LABELS, "Footer order is incorrect")
    require(page.locator(".app-footer__platform").count() == 0, "Bottom MarinOS link must be omitted")
    require(page.locator(".app-footer__app-name").inner_text() == "MarinOS", "Footer label changed")
    require(not page.locator(".app-footer__app-name").evaluate("el=>!!el.closest('a')"), "Footer app name must be plain text")
    require(page.locator(".app-title__link").get_attribute("href") == "./", "Title home link missing")
    for selector in [".app-icon", ".app-subtitle"]:
        require(not page.locator(selector).evaluate("el=>!!el.closest('a')"), f"{selector} must not link home")
    require(page.locator(".app-title__status").inner_text() == STATUS_LABEL, "Local manifest status badge is missing")
    require(page.locator(".marinos-banner__status").inner_text() == STATUS_LABEL, "Banner label differs from manifest")
    require(page.locator(".app-icon svg").get_attribute("stroke-width") == "2", "24x24 canonical icon stroke changed")
    require(page.locator(".skip-link").count() == 1 and page.locator("#app-status-message").count() == 1, "Duplicated shell infrastructure")
    require(page.locator(".app-feedback").count() == 1, "Duplicate Feedback control")
    require(page.evaluate("(()=>{const a=[...document.querySelectorAll('[id]')].map(x=>x.id);return a.length===new Set(a).size;})()"), "Duplicate rendered IDs")
    check_fonts(page)
    no_overflow(page, f"directory {width} {scheme}")

    # Keyboard focus and menu behavior.
    page.keyboard.press("Tab")
    require(page.locator(".skip-link").evaluate("el=>el===document.activeElement"), "Skip link is not first keyboard stop")
    require(page.locator(".skip-link").evaluate("el=>getComputedStyle(el).outlineStyle") != "none", "Keyboard outline is missing")
    page.keyboard.press("Tab")
    page.keyboard.press("Enter")
    require(page.locator("#marinos-menu-panel").is_visible(), "Banner menu does not open from keyboard")
    page.keyboard.press("Escape")
    require(page.locator("#marinos-menu-panel").is_hidden(), "Banner Escape does not close menu")
    require(page.locator(".marinos-menu__toggle").evaluate("el=>el===document.activeElement"), "Banner Escape did not restore focus")
    page.locator(".marinos-menu__toggle").click()
    in_menu = len([c for c in CATALOG if not c.get("unlisted")])  # the menu leaves out an unlisted app
    page.wait_for_function("n=>document.querySelectorAll('#marinos-menu-panel .marinos-menu__name').length===n", arg=in_menu)
    require(page.locator("#marinos-menu-panel .marinos-menu__status").count() == in_menu, "Menu status badges missing")
    page.keyboard.press("Escape")

    for route in ROUTES:
        goto_route(page, route)
        if route == "projects":
            page.locator("[data-projects-table]").wait_for()
            hidden_urls = {c["url"].rstrip("/") for c in CATALOG if c.get("unlisted")}  # an unlisted app's project is hidden too
            count = len([p for p in json.loads((ROOT / "projects.json").read_text()) + json.loads((ROOT / "external-projects.json").read_text()) if p.get("url", "").rstrip("/") not in hidden_urls])
            require(page.locator("[data-projects-body] tr").count() == count, "Projects data lost")
            tabs = page.locator("[data-projects-tabs] [role=tab]")
            tabs.nth(0).focus()
            page.keyboard.press("ArrowRight")
            require(tabs.nth(1).get_attribute("aria-selected") == "true", "Project ArrowRight failed")
            require(all(s == "active" for s in page.locator("[data-projects-body] tr:visible").evaluate_all("rows=>rows.map(x=>x.dataset.projectStatus)")), "Active filter failed")
            page.keyboard.press("End")
            require(tabs.nth(2).get_attribute("aria-selected") == "true", "Project End key failed")
            require(all(s == "completed" for s in page.locator("[data-projects-body] tr:visible").evaluate_all("rows=>rows.map(x=>x.dataset.projectStatus)")), "Completed filter failed")
            page.keyboard.press("Home")
            require(page.locator("[data-projects-body] tr:visible").count() == count, "All filter failed")
            sort = page.locator("[data-sort-key=title]")
            sort.click(); sort.click()
            require(sort.locator("..").get_attribute("aria-sort") == "descending", "Shell sorting not connected")
        elif route == "status":
            page.locator("[data-status-inventory-table]").wait_for()
            require(page.locator("[data-status-inventory-body] tr").count() == len(LISTED), "Status inventory changed")
            if scheme == "dark":
                badge = page.locator('#status .app-status[data-status="alpha"]').first
                require(badge.evaluate("el=>getComputedStyle(el).color") == "rgb(0, 0, 0)", "Alpha dark text is not black")
                require(badge.evaluate("el=>getComputedStyle(el).backgroundColor") == "rgb(229, 181, 59)", "Alpha dark fill is not gold")
        elif route == "security":
            page.locator("[data-inventory-table]").wait_for()
            require(page.locator("[data-inventory-body] tr").count() == len(LISTED) + 1, "Security inventory must include MarinOS")
            page.wait_for_function("document.querySelector('[data-security-content]').textContent.includes('Built for:')")
        elif route == "accessibility":
            page.locator("[data-accessibility-table]").wait_for()
            require(page.locator("[data-accessibility-body] tr").count() == len(LISTED) + 1, "Platform accessibility inventory lost")
            require(page.locator("[data-accessibility-body] .app-score").count() > 0, "Shared score gauge missing")
            require(page.locator("[data-accessibility-scores]").count() == 0, "An unwanted second score renderer was added")
        elif route == "updates":
            page.locator("[data-updates-list] article").first.wait_for()
            require(page.locator("[data-updates-list]").inner_text().find("Fixture update") >= 0, "Updates fixture did not render")
            require(page.locator("#updates [data-copy-value]").count() > 0, "Shell copy/share controls missing")
        no_overflow(page, f"{route} {width} {scheme}")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


class Runner:
    def __init__(self, browser, fixture_mode: bool, base: str):
        self.browser = browser
        self.fixture_mode = fixture_mode
        self.base = base

    def page(self, context, overrides=None, route=""):
        data = fixtures()
        data.update(overrides or {})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        if self.fixture_mode:
            # No attempted network/navigation: source styles/scripts are injected
            # in order, and fetch returns deterministic in-memory responses.
            html = (ROOT / "index.html").read_text()
            html = remove_from_html(html, "links", "scripts")
            page.set_content(html)
            inject_styles(page)
            page.evaluate(FETCH_FIXTURE, data)
            if route:
                page.evaluate("name=>{location.hash=name;}", route)
            page.add_script_tag(content=(ROOT / "vendor/marinos/marinos.js").read_text())
            page.add_script_tag(content=(ROOT / "assets/app.js").read_text())
        else:
            def external(request):
                url = request.request.url
                parts = urlsplit(url)
                docs_key = parts.path.lstrip("/")
                if parts.hostname == "marincountygov.github.io" and docs_key in ("marin-docs/search-index.json", "marin-docs/pmrs/search.json", "marin-census/search-index.json"):
                    request.fulfill(status=200, body=data[docs_key]["body"], content_type="application/json", headers={"Access-Control-Allow-Origin": "*"})
                    return
                from_github = parts.hostname == "api.github.com"
                response = data["__commits__"] if from_github else data["security.json"]
                if not from_github and not parts.path.endswith("/security.json"):
                    raise AssertionError(f"Unexpected external browser request: {url}")
                request.fulfill(status=response["status"], body=response["body"],
                                content_type="application/json", headers={"Access-Control-Allow-Origin": "*"})
            page.route("https://**/*", external)
            for name, response in (overrides or {}).items():
                def override(request, *, response=response):  # keyword-only: newer Playwright passes (route, request)
                    request.fulfill(status=response["status"], body=response["body"], content_type="application/json")
                page.route(self.base + name, override)
            page.goto(self.base + (f"#{route}" if route else ""), wait_until="networkidle")
        ready(page)
        return page, errors

    def run(self, screenshots: Path | None):
        total = 0
        for width, scheme in [(1440, "light"), (1440, "dark"), (390, "light"), (390, "dark"), (320, "light"), (320, "dark")]:
            context = self.browser.new_context(viewport={"width": width, "height": 1000}, color_scheme=scheme)
            try:
                page, errors = self.page(context)
                check_structure(page, width, scheme)
                require(not errors, f"Uncaught JavaScript errors: {errors}")
                if screenshots:
                    screenshots.mkdir(parents=True, exist_ok=True)
                    page.evaluate("location.hash='directory'")
                    visible_route(page, "directory")
                    page.screenshot(path=str(screenshots / f"{width}-{scheme}-directory.png"), full_page=True)
                    goto_route(page, "accessibility")
                    page.screenshot(path=str(screenshots / f"{width}-{scheme}-accessibility.png"), full_page=True)
                print(f"PASS: {width}px {scheme}; header/footer, routes, inventories, fonts, keyboard, menus, and reflow")
                total += 1
            finally:
                context.close()
        # Start with each deep link before the shell runs.
        for route in ROUTES + ["unknown-route"]:
            context = self.browser.new_context(viewport={"width": 1280, "height": 900})
            try:
                page, errors = self.page(context, route=route)
                visible_route(page, "directory" if route == "unknown-route" else route)
                require(not errors, str(errors))
                if not self.fixture_mode:
                    page.evaluate("window.__navigationProbe = true")
                    page.locator(".app-title__link").click()
                    ready(page)
                    visible_route(page, "directory")
                    require(page.evaluate("!window.__navigationProbe"), "Home must perform a full navigation")
                    require(page.url == self.base, "Home did not clear the hash")
                total += 1
            finally:
                context.close()
        print("PASS: direct route initialization and unknown-hash fallback" + ("; HTTP home navigation" if not self.fixture_mode else " (in-memory only)"))
        # Error/partial-data states stay visible instead of losing all content.
        scenarios = [
            ({"external-projects.json": {"status": 503, "body": "unavailable"}}, "projects", "[data-projects-status]", "Some projects"),
            ({"projects.json": {"status": 503, "body": "unavailable"}, "external-projects.json": {"status": 503, "body": "unavailable"}}, "projects", "[data-projects-status]", "Couldn't load projects"),
            ({"data/lighthouse.json": {"status": 404, "body": "missing"}}, "accessibility", "[data-accessibility-status]", "haven't been collected"),
        ]
        for override, route, selector, message in scenarios:
            context = self.browser.new_context()
            try:
                page, errors = self.page(context, override)
                goto_route(page, route)
                page.wait_for_function("([selector,message])=>document.querySelector(selector).textContent.includes(message)", arg=[selector, message])
                require(not errors, str(errors))
                total += 1
            finally:
                context.close()
        print("PASS: Projects partial/total failure and missing Lighthouse data")
        # The search box on the home page: a word finds the app, the count line is "N results / matching", the grid steps aside and comes back.
        context = self.browser.new_context(viewport={"width": 1280, "height": 900})
        try:
            page, errors = self.page(context)
            require(page.locator("#home-search").is_visible(), "The search box shows when JavaScript runs")
            page.fill("#home-search-input", "budget")
            page.wait_for_function("document.getElementById('home-search-status').textContent.includes('matching')")
            status = page.locator("#home-search-status").inner_text()
            require("result" in status and "\u201cbudget\u201d" in status and " / " in status, f"The count line is 'N results / matching': {status!r}")
            require(page.locator("#home-search-results .home-search__group a", has_text="Marin Budget").count() >= 1, "The search finds Marin Budget")
            require(page.locator("#home-apps").is_hidden(), "The Apps section steps aside while there are results")
            page.keyboard.press("Escape")
            require(page.locator("#home-apps").is_visible() and page.locator("#home-search-status").inner_text() == "", "Escape empties the box and brings the grid back")
            # The All apps page lists every listed app and the home page links to it; an unlisted app is not found anywhere.
            page.locator("#home-apps a[href='#apps']").click()
            visible_route(page, "apps")
            require(page.locator("#apps .directory-card").count() == len(LISTED), "All apps must list every listed app")
            page.locator(".app-title__link").click()
            visible_route(page, "directory")
            for unlisted in [c for c in CATALOG if c.get("unlisted")]:
                page.fill("#home-search-input", unlisted["name"])
                page.wait_for_function("document.getElementById('home-search-status').textContent.length > 0")
                require(page.locator("#home-search-results .home-search__group a", has_text=unlisted["name"]).count() == 0, f"Search must not find the unlisted app {unlisted['name']}")
                page.keyboard.press("Escape")
            if not self.fixture_mode:
                # The County's places come from the list marin-data builds, and open on their page in Marin Pulse.
                page.fill("#home-search-input", "san rafael")
                page.wait_for_function("document.getElementById('home-search-status').textContent.includes('matching')")
                link = page.locator("#home-search-results .home-search__group a", has_text="San Rafael").first
                require(link.count() == 1 and "/marin-pulse/places/san-rafael.html" in link.get_attribute("href"), "A place is found and opens in Marin Pulse")
                page.fill("#home-search-input", "district 3")
                page.wait_for_function("document.getElementById('home-search-status').textContent.includes('matching')")
                require(page.locator("#home-search-results .home-search__group a", has_text="District 3").count() >= 1, "District 3 is found")
            # An app's own content: a result shows a line of its text with the words marked, and pressing it keeps the words for the next page.
            page.fill("#home-search-input", "grievance form")
            page.wait_for_function("document.getElementById('home-search-status').textContent.includes('matching')")
            first = page.locator("#home-search-results .home-search__group li", has_text="PMR 24.3").first
            require(first.count() == 1 and first.locator(".search-snippet mark.search-hit").count() >= 2, "A page of an app's own content shows a line of text with the words marked")
            require("pmr-24.html#24-3" in first.locator("a").first.get_attribute("href"), "The result opens the section")
            # Marin Census lists its places and measures: a result opens the app on that place.
            page.fill("#home-search-input", "median household")
            page.wait_for_function("document.getElementById('home-search-status').textContent.includes('matching')")
            stat = page.locator("#home-search-results .home-search__group a", has_text="Median household income").first
            require(stat.count() == 1 and stat.get_attribute("href") == "https://marincountygov.github.io/marin-census/#data", "A Marin Census measure is found and opens the app")
            page.fill("#home-search-input", "zzzzqq")
            page.wait_for_function("document.getElementById('home-search-status').textContent.includes('0 results')")
            require(not errors, str(errors))
            total += 1
        finally:
            context.close()
        print("PASS: home search finds an app, says how many, and gives the grid back")
        context = self.browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 900})
        try:
            page = context.new_page()
            if self.fixture_mode:
                text = remove_from_html((ROOT / "index.html").read_text(), "links", "scripts")
                # A style element in initial HTML works with JavaScript disabled;
                # add_style_tag waits for a script-driven event in some browsers.
                text = text.replace("</head>", "<style>" + fixture_css() + "</style></head>")
                page.set_content(text, wait_until="domcontentloaded")
            else:
                page.goto(self.base, wait_until="networkidle")
            require(page.locator("#apps .directory-card:visible").count() == len(LISTED), "All apps fails without JavaScript")
            require(page.locator("#home-apps .directory-card:visible").count() == len(FEATURED), "Featured apps fail without JavaScript")
            require(page.locator(".directory-card h3 a").count() == len(LISTED) + len(FEATURED), "No-JavaScript card links missing")
            require(page.locator("noscript h1").is_visible(), "No-JavaScript title missing")
            require(page.locator("#home-search").is_hidden(), "The search box stays hidden without JavaScript")
            total += 1
            print("PASS: no-JavaScript static directory")
        finally:
            context.close()
        print(f"browser_app_shell.py: PASS ({total} scenarios; " + ("in-memory fixtures, NOT HTTP loading/timing/navigation" if self.fixture_mode else "real localhost HTTP; external API responses are fixtures") + ")")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", action="store_true", help="Limited in-memory tests; not an HTTP/deployment test")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    server = None
    base = ""
    try:
        if not args.fixtures:
            handler = functools.partial(QuietHandler, directory=str(ROOT.parent))
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            base = f"http://127.0.0.1:{server.server_port}/{quote(ROOT.name)}/"
        with sync_playwright() as playwright:
            executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("google-chrome")
            kwargs = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if executable:
                kwargs["executable_path"] = executable
            browser = playwright.chromium.launch(**kwargs)
            try:
                Runner(browser, args.fixtures, base).run(args.screenshots)
            finally:
                browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
