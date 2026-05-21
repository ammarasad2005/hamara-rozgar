"""
╔══════════════════════════════════════════════════════════════════════════════╗
║          Hamara Rozgar — Google Maps Grid Scraper (Production Grade)         ║
║          Target: Rawalpindi & Islamabad twin-cities 1km×1km grid             ║
║          Nodes: 532  |  Categories: 7  |  Total searches: up to 3,724        ║
╚══════════════════════════════════════════════════════════════════════════════╝

SETUP INSTRUCTIONS
──────────────────
1. Install dependencies:
       pip install playwright pandas tqdm

2. Install Playwright browsers:
       playwright install chromium

3. (Optional but recommended) Install stealth plugin:
       pip install playwright-stealth

4. Place twin_cities_grid.csv in the same directory as this script.

5. Run:
       python hamara_rozgar_scraper.py

RESUMABILITY
────────────
   The script writes a `.progress` file tracking (row_index, category_index).
   If interrupted, re-run the same command — it will pick up exactly where
   it left off. Delete `scraper.progress` to restart from scratch.

OUTPUT
──────
   scraped_providers.csv — flat CSV, Supabase-ready, deduplicated by phone+name.

ENVIRONMENT VARIABLES (optional overrides)
──────────────────────────────────────────
   HEADLESS=1            Run headless (default: visible browser for anti-bot)
   SLOW_MO=200           Playwright slow_mo in ms (default: 150)
   MIN_DELAY=2           Min random delay in seconds (default: 2)
   MAX_DELAY=5           Max random delay in seconds (default: 5)
   MAX_SCROLLS=30        Safety cap on scroll attempts per query (default: 30)
   CONCURRENCY=1         Parallel browser contexts (keep 1 unless you have
                         residential proxies — Maps bans parallel scrapers fast)
"""

import asyncio
import csv
import json
import logging
import os
import random
import re
import sys
import time
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
from tqdm import tqdm

# ── Optional stealth plugin ──────────────────────────────────────────────────
try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

GRID_CSV          = Path("twin_cities_grid.csv")
OUTPUT_CSV        = Path("scraped_providers.csv")
PROGRESS_FILE     = Path("scraper.progress")
LOG_FILE          = Path("scraper.log")

TARGET_CATEGORIES = [
    "Plumber",
    "AC Technician",
    "Electrician",
    "Tutor Academy",
    "Beauty Parlor",
    "Car Mechanic",
    "Carpenter",
]

# ── Query Expansion: Multiple individual search terms per category ────────────
# IMPORTANT: Google Maps does NOT support boolean OR operators.
# Each term in this list is run as a SEPARATE search query at each grid node.
# This expands coverage by sweeping for local Pakistani business naming patterns
# (e.g. a plumber might list himself as "sanitary store" not "plumber").
CATEGORY_SEARCH_QUERIES: dict[str, list[str]] = {
    "Plumber":       ["Plumber", "Sanitary Store", "Pipe Fitting"],
    "AC Technician": ["AC Technician", "AC Repair", "Refrigerator Repair"],
    "Electrician":   ["Electrician", "Electric Store", "Fan Repair"],
    "Tutor Academy": ["Tutor Academy", "Tuition Center"],
    "Beauty Parlor": ["Beauty Parlor", "Beauty Salon"],
    "Car Mechanic":  ["Car Mechanic", "Auto Workshop", "Puncture Shop"],
    "Carpenter":     ["Carpenter", "Furniture Shop", "Wood Works"],
}


# Env-configurable knobs
HEADLESS     = bool(int(os.getenv("HEADLESS", "0")))
SLOW_MO      = int(os.getenv("SLOW_MO", "150"))
MIN_DELAY    = float(os.getenv("MIN_DELAY", "2"))
MAX_DELAY    = float(os.getenv("MAX_DELAY", "5"))
MAX_SCROLLS  = int(os.getenv("MAX_SCROLLS", "30"))
MAX_RUN_TIME = int(os.getenv("MAX_RUN_TIME", "0"))  # Max duration in seconds (0 = unlimited)

# Selectors — Google Maps DOM is obfuscated; use stable role/aria anchors.
SEL_RESULTS_PANEL  = '[role="feed"]'
# ROBUST card selector: targets the clickable <a> link inside each result card.
# Avoids '[role="feed"] > div[jsaction]' which fails when Google updates its DOM.
SEL_RESULT_ITEMS   = '[role="feed"] a[href*="/maps/place/"]'
SEL_END_OF_LIST    = "text=You've reached the end of the list"
SEL_SPINNER        = '[role="feed"] img[src*="loading"]'

# ── Rotating User-Agents ─────────────────────────────────────────────────────
USER_AGENTS = [
    # Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
]

# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODEL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Provider:
    name:          str            = ""
    specialization: str           = ""
    phone:         Optional[str]  = None
    rating:        Optional[float] = None
    review_count:  Optional[int]  = None
    address:       Optional[str]  = None
    latitude:      Optional[float] = None
    longitude:     Optional[float] = None
    google_place_url: Optional[str] = None
    scraped_at:    str            = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Deduplication key: name + phone (lowercased, stripped)
    def dedup_key(self) -> str:
        n = (self.name or "").strip().lower()
        p = re.sub(r"\s+", "", self.phone or "")
        return f"{n}|{p}"

    def to_dict(self):
        return asdict(self)

CSV_FIELDNAMES = [f.name for f in fields(Provider)]

# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("hamara_rozgar")

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def human_delay(lo: float = MIN_DELAY, hi: float = MAX_DELAY) -> float:
    """Sleep for a random duration; returns actual seconds slept."""
    t = random.uniform(lo, hi) + random.gauss(0, 0.3)
    t = max(0.5, t)
    time.sleep(t)
    return t


def parse_coords_from_url(url: str) -> tuple[Optional[float], Optional[float]]:
    """
    Extract lat/lon from a Google Maps URL.
    Handles formats:
      • /maps/place/.../@33.6409,72.9814,...
      • /maps/place/...!3d33.6409!4d72.9814
      • /maps?q=33.6409,72.9814
      • ll=33.6409,72.9814
    """
    # Format: @lat,lon  (most common in place URLs)
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))

    # Format: !3d<lat>!4d<lon>
    m3d = re.search(r"!3d(-?\d+\.\d+)", url)
    m4d = re.search(r"!4d(-?\d+\.\d+)", url)
    if m3d and m4d:
        return float(m3d.group(1)), float(m4d.group(1))

    # Format: ll=lat,lon or q=lat,lon
    m = re.search(r"(?:ll|q)=(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))

    return None, None


def normalise_phone(raw: str) -> Optional[str]:
    """
    Strips whitespace, normalises Pakistani numbers to +92 prefix.
    Returns None if the string doesn't look like a phone number.
    """
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw.strip())
    if len(digits) < 7:
        return None
    # 03xx... → +923xx...
    if re.match(r"^03\d{9}$", digits):
        digits = "+92" + digits[1:]
    # 923xx... → +923xx...
    elif re.match(r"^923\d{9}$", digits):
        digits = "+" + digits
    return digits


def load_progress() -> tuple[int, int]:
    """Return (node_index, category_index) to resume from."""
    if PROGRESS_FILE.exists():
        try:
            data = json.loads(PROGRESS_FILE.read_text())
            log.info(f"Resuming from node {data['node_idx']}, category {data['cat_idx']}")
            return data["node_idx"], data["cat_idx"]
        except Exception:
            pass
    return 0, 0


def save_progress(node_idx: int, cat_idx: int):
    PROGRESS_FILE.write_text(json.dumps({"node_idx": node_idx, "cat_idx": cat_idx}))


def load_seen_keys() -> set:
    """Load deduplication keys from any existing output CSV."""
    seen = set()
    if OUTPUT_CSV.exists():
        try:
            df = pd.read_csv(OUTPUT_CSV, dtype=str)
            for _, row in df.iterrows():
                name  = str(row.get("name", "")).strip().lower()
                phone = re.sub(r"\s+", "", str(row.get("phone", "")))
                seen.add(f"{name}|{phone}")
            log.info(f"Loaded {len(seen)} existing dedup keys from {OUTPUT_CSV}")
        except Exception as e:
            log.warning(f"Could not load existing CSV for dedup: {e}")
    return seen


def append_to_csv(providers: list[Provider]):
    """Append a batch of Provider rows to the output CSV."""
    if not providers:
        return
    write_header = not OUTPUT_CSV.exists()
    with open(OUTPUT_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if write_header:
            writer.writeheader()
        for p in providers:
            writer.writerow(p.to_dict())


# ═══════════════════════════════════════════════════════════════════════════════
# BROWSER CONTEXT FACTORY
# ═══════════════════════════════════════════════════════════════════════════════

async def make_context(playwright: Playwright) -> tuple[Browser, BrowserContext]:
    ua = random.choice(USER_AGENTS)
    browser = await playwright.chromium.launch(
        headless=HEADLESS,
        slow_mo=SLOW_MO,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-dev-shm-usage",
            "--lang=en-US",
        ],
    )
    context = await browser.new_context(
        user_agent=ua,
        locale="en-US",
        timezone_id="Asia/Karachi",
        viewport={"width": random.randint(1280, 1440), "height": random.randint(768, 900)},
        java_script_enabled=True,
        permissions=["geolocation"],
        geolocation={"latitude": 33.6844, "longitude": 73.0479},  # Islamabad
        color_scheme="light",
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
    )
    # Mask WebDriver flag via CDP
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    if STEALTH_AVAILABLE:
        # stealth_async is applied per-page; stored for use in scrape loop
        pass
    return browser, context


# ═══════════════════════════════════════════════════════════════════════════════
# CORE SCRAPING LOGIC
# ═══════════════════════════════════════════════════════════════════════════════

async def scroll_results_to_end(page: Page) -> None:
    """
    Scroll the Google Maps results panel until the 'end of list' sentinel
    appears or MAX_SCROLLS is reached.
    """
    try:
        panel = await page.wait_for_selector(SEL_RESULTS_PANEL, timeout=10_000)
    except Exception:
        log.debug("Results panel not found — skipping scroll")
        return

    for i in range(MAX_SCROLLS):
        # Check for end-of-list sentinel
        end_el = await page.query_selector(SEL_END_OF_LIST)
        if end_el and await end_el.is_visible():
            log.debug(f"Reached end of list after {i} scrolls")
            return

        # Scroll the panel element (not window.scrollBy)
        await panel.evaluate("el => el.scrollBy(0, 800)")
        await asyncio.sleep(random.uniform(0.8, 1.8))

        # Wait for any loading spinner to disappear
        try:
            await page.wait_for_selector(SEL_SPINNER, state="detached", timeout=3_000)
        except Exception:
            pass

    log.debug(f"Reached MAX_SCROLLS={MAX_SCROLLS} without finding end-of-list sentinel")


async def extract_listing_data(
    page: Page,
    category: str,
    context: BrowserContext,
) -> list[Provider]:
    """
    From the currently displayed search results, click each card, extract
    details from the detail pane, and return a list of Provider objects.
    Uses index-based Playwright Locators to completely bypass stale element exceptions.
    """
    results: list[Provider] = []

    # Use locator for dynamic re-fetching to prevent stale reference exceptions.
    # SEL_RESULT_ITEMS targets <a href="/maps/place/..."> links inside the feed.
    # Each such anchor IS the clickable business card.
    cards_locator = page.locator(SEL_RESULT_ITEMS)
    card_count = await cards_locator.count()
    log.info(f"Found {card_count} result cards in feed.")

    for idx in range(card_count):
        try:
            card = cards_locator.nth(idx)

            # Extract business name from the aria-label of the anchor,
            # which Google Maps reliably populates (e.g. aria-label="Ali Plumber").
            # Fall back to reading inner text of the first heading span inside.
            biz_name = ""
            try:
                biz_name = (await card.get_attribute("aria-label") or "").strip()
            except Exception:
                pass
            if not biz_name:
                try:
                    name_el = card.locator('[class*="fontHeadlineSmall"], .qBF1Pd, span[class]').first
                    if await name_el.count() > 0:
                        biz_name = (await name_el.inner_text()).strip()
                except Exception:
                    pass
            if not biz_name or len(biz_name) < 2:
                continue

            # Click the card to open its detail pane
            await card.scroll_into_view_if_needed()
            await card.click()
            human_delay(1.5, 2.8)

            # Grab current URL — it contains coordinates
            detail_url = page.url
            lat, lon = parse_coords_from_url(detail_url)

            # ── Business name (re-extract from detail pane for accuracy) ──
            try:
                name_detail = await page.locator('h1[class*="DUwDvf"], h1.DUwDvf, [data-attrid="title"] span').first.inner_text(timeout=3_000)
                biz_name = name_detail.strip() or biz_name
            except Exception:
                pass

            # ── Rating ────────────────────────────────────────────────────
            rating = None
            try:
                rating_el = await page.query_selector('[class*="ceNzKf"] span[aria-hidden="true"], .MW4etd, [class*="Aq14fc"]')
                if rating_el:
                    rating_text = await rating_el.inner_text()
                    rating = float(rating_text.strip().replace(",", "."))
            except Exception:
                pass

            # ── Review count ──────────────────────────────────────────────
            review_count = None
            try:
                review_el = await page.query_selector('[class*="UY7F9"], .F7nice span[aria-label*="review"], [aria-label*="reviews"]')
                if review_el:
                    rc_text = await review_el.get_attribute("aria-label") or await review_el.inner_text()
                    m = re.search(r"([\d,]+)", rc_text)
                    if m:
                        review_count = int(m.group(1).replace(",", ""))
            except Exception:
                pass

            # ── Phone ──────────────────────────────────────────────────────
            phone = None
            try:
                # Google Maps renders phone in a button with data-tooltip containing "Copy phone"
                phone_btn = await page.query_selector('[data-tooltip*="phone"], [aria-label*="phone"], button[data-item-id*="phone"]')
                if phone_btn:
                    raw_phone = (
                        await phone_btn.get_attribute("aria-label")
                        or await phone_btn.get_attribute("data-tooltip")
                        or await phone_btn.inner_text()
                    )
                    phone = normalise_phone(raw_phone)

                if not phone:
                    # Fallback: look for any visible text matching phone patterns
                    all_text = await page.inner_text("body")
                    phone_matches = re.findall(r"(?:\+92|0)(?:3\d{2}|51|42|21)\s*[-.\s]?\d{3}\s*[-.\s]?\d{4}", all_text)
                    if phone_matches:
                        phone = normalise_phone(phone_matches[0])
            except Exception:
                pass

            # ── Address ────────────────────────────────────────────────────
            address = None
            try:
                addr_btn = await page.query_selector(
                    'button[data-item-id*="address"], [data-tooltip*="address"], '
                    '[aria-label*="Address"], .rogA2c .Io6YTe'
                )
                if addr_btn:
                    address = (await addr_btn.inner_text()).strip()
                if not address:
                    addr_el = await page.query_selector('[class*="LrzXr"]')
                    if addr_el:
                        address = (await addr_el.inner_text()).strip()
            except Exception:
                pass

            # ── Coordinates from URL (most reliable) ──────────────────────
            if lat is None:
                # Try extracting from any Google Maps link in the page
                links = await page.query_selector_all('a[href*="maps"]')
                for link in links[:5]:
                    href = await link.get_attribute("href") or ""
                    lat, lon = parse_coords_from_url(href)
                    if lat:
                        break

            provider = Provider(
                name=biz_name,
                specialization=category,
                phone=phone,
                rating=rating,
                review_count=review_count,
                address=address,
                latitude=lat,
                longitude=lon,
                google_place_url=detail_url if "place" in detail_url else None,
            )
            results.append(provider)
            log.info(f"  Scraped [{len(results)}/{card_count}]: {biz_name} | {phone} | {rating}★ | ({lat},{lon})")

            # ── Close Detail View ─────────────────────────────────────────
            # Click the UI "Back to results" button (instead of browser page.go_back(), 
            # which triggers a heavy reload and ruins the DOM state).
            back_btn = page.locator('button[aria-label="Back to results"], button[aria-label="Back"], button[jsaction*="pane.back"]').first
            if await back_btn.is_visible():
                await back_btn.click()
                await asyncio.sleep(random.uniform(0.6, 1.2))

        except Exception as e:
            log.warning(f"Error extracting card index {idx}: {e}")
            # Ensure detail pane is closed before trying the next card
            try:
                back_btn = page.locator('button[aria-label="Back to results"], button[aria-label="Back"], button[jsaction*="pane.back"]').first
                if await back_btn.is_visible():
                    await back_btn.click()
                    await asyncio.sleep(0.8)
            except Exception:
                pass
            continue

    return results


async def search_node(
    page: Page,
    context: BrowserContext,
    lat: float,
    lon: float,
    category: str,
    search_term: str,
) -> list[Provider]:
    """
    Execute a single (node, category, search_term) search and return all scraped Providers.
    search_term is one specific query string (e.g. "Plumber", "Sanitary Store") from
    CATEGORY_SEARCH_QUERIES[category] — Google Maps does not support boolean OR.
    """
    query = f"{search_term} near {lat:.5f}, {lon:.5f}"
    # Encode properly: spaces→+, keep commas as-is
    encoded_query = query.replace(' ', '+').replace(',', ',')
    search_url = (
        f"https://www.google.com/maps/search/{encoded_query}/"
        f"@{lat},{lon},15z?hl=en"
    )

    log.info(f"→ [{category}] Query: '{search_term}' near {lat:.5f},{lon:.5f}")

    try:
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
        if STEALTH_AVAILABLE:
            await stealth_async(page)

        # Handle consent / cookie prompts
        for consent_sel in [
            'button[aria-label*="Accept all"]',
            'button[aria-label*="Agree"]',
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
        ]:
            try:
                btn = await page.wait_for_selector(consent_sel, timeout=3_000)
                await btn.click()
                await asyncio.sleep(0.5)
            except Exception:
                pass

        # Wait for results panel to appear
        try:
            await page.wait_for_selector(SEL_RESULTS_PANEL, timeout=15_000)
        except Exception:
            log.warning(f"No results panel found for: {query}")
            return []

        human_delay(1.0, 2.0)

        # Scroll to load all results
        await scroll_results_to_end(page)
        human_delay(0.5, 1.2)

        # Extract data from each listing
        providers = await extract_listing_data(page, category, context)
        return providers

    except Exception as e:
        log.error(f"Failed search for ({lat},{lon}) {category}: {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

async def run():
    # ── Load grid ──────────────────────────────────────────────────────────────
    if not GRID_CSV.exists():
        log.error(f"Grid CSV not found: {GRID_CSV.resolve()}")
        sys.exit(1)

    grid = pd.read_csv(GRID_CSV)
    total_nodes = len(grid)
    total_searches = total_nodes * len(TARGET_CATEGORIES)
    log.info(f"Grid loaded: {total_nodes} nodes × {len(TARGET_CATEGORIES)} categories = {total_searches} searches")

    # ── Resume state ───────────────────────────────────────────────────────────
    start_node, start_cat = load_progress()
    seen_keys: set = load_seen_keys()
    new_records = 0

    # ── Progress bar ───────────────────────────────────────────────────────────
    completed_before = start_node * len(TARGET_CATEGORIES) + start_cat
    pbar = tqdm(
        total=total_searches,
        initial=completed_before,
        desc="Scraping",
        unit="search",
        dynamic_ncols=True,
    )

    async with async_playwright() as pw:
        browser, context = await make_context(pw)
        page = await context.new_page()

        # Block unnecessary resources for speed
        await page.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ("image", "font", "media", "stylesheet")
            and "maps.googleapis.com" not in route.request.url
            and "maps.gstatic.com" not in route.request.url
            else route.continue_(),
        )

        try:
            start_time = time.time()
            for node_idx in range(start_node, total_nodes):
                # Graceful cutoff check for time-limited environments (e.g. GitHub Actions)
                if MAX_RUN_TIME > 0 and (time.time() - start_time) > MAX_RUN_TIME:
                    log.info(f"Reached execution time limit of {MAX_RUN_TIME} seconds. Exiting gracefully to save progress.")
                    break

                row = grid.iloc[node_idx]
                lat, lon = float(row["latitude"]), float(row["longitude"])

                cat_start = start_cat if node_idx == start_node else 0

                # ── Expand each category into individual search terms ──────
                # Build a flat list of (cat_idx, search_term) pairs to iterate.
                # Google Maps does NOT support boolean OR — each term is a
                # separate search. We use cat_idx for progress tracking and
                # deduplicate results across terms using seen_keys.
                all_searches: list[tuple[int, str, str]] = []
                for cat_idx, category in enumerate(TARGET_CATEGORIES):
                    for term in CATEGORY_SEARCH_QUERIES.get(category, [category]):
                        all_searches.append((cat_idx, category, term))

                # Determine the starting search offset within this node
                # (cat_start tracks the category index, not the flat term index)
                start_search_idx = 0
                if node_idx == start_node and cat_start > 0:
                    # Skip all searches for categories before cat_start
                    start_search_idx = sum(
                        len(CATEGORY_SEARCH_QUERIES.get(TARGET_CATEGORIES[c], [TARGET_CATEGORIES[c]]))
                        for c in range(cat_start)
                    )

                for search_offset, (cat_idx, category, term) in enumerate(all_searches):
                    if search_offset < start_search_idx:
                        pbar.update(0)  # don't double-count already-done searches
                        continue

                    providers = await search_node(page, context, lat, lon, category, term)

                    # ── Deduplication ─────────────────────────────────────
                    fresh: list[Provider] = []
                    for p in providers:
                        key = p.dedup_key()
                        if key not in seen_keys:
                            seen_keys.add(key)
                            fresh.append(p)

                    # ── Incremental save ──────────────────────────────────
                    if fresh:
                        append_to_csv(fresh)
                        new_records += len(fresh)

                    log.info(
                        f"Node [{node_idx+1}/{total_nodes}] | Cat [{cat_idx+1}/{len(TARGET_CATEGORIES)}] "
                        f"| Term '{term}' | Found {len(providers)} | New {len(fresh)} | Total new: {new_records}"
                    )

                    # Save progress AFTER each (node, category) pair
                    save_progress(node_idx, cat_idx + 1)
                    pbar.update(1)

                    # Inter-query delay
                    human_delay(MIN_DELAY, MAX_DELAY)

                    # Rotate browser context every ~50 searches to reset fingerprint
                    searches_done = (node_idx * len(all_searches)) + search_offset + 1
                    if searches_done % 50 == 0:
                        log.info("Rotating browser context for anti-detection...")
                        await page.close()
                        await context.close()
                        await browser.close()
                        browser, context = await make_context(pw)
                        page = await context.new_page()
                        await page.route(
                            "**/*",
                            lambda route: route.abort()
                            if route.request.resource_type in ("image", "font", "media", "stylesheet")
                            and "maps.googleapis.com" not in route.request.url
                            and "maps.gstatic.com" not in route.request.url
                            else route.continue_(),
                        )
                        human_delay(3, 6)

                # After all categories for this node, advance node progress
                save_progress(node_idx + 1, 0)

            # If we completed the entire loop fully without breaking early, clear the progress file
            if not (MAX_RUN_TIME > 0 and (time.time() - start_time) > MAX_RUN_TIME) and node_idx >= total_nodes - 1:
                if PROGRESS_FILE.exists():
                    PROGRESS_FILE.unlink()
                    log.info("Scraper completed fully! Progress file cleared.")

        except KeyboardInterrupt:
            log.warning("Interrupted by user — progress saved. Re-run to resume.")
        except Exception as e:
            log.error(f"Unexpected error: {e}", exc_info=True)
        finally:
            pbar.close()
            try:
                await page.close()
                await context.close()
                await browser.close()
            except Exception:
                pass

    log.info(f"Done. {new_records} new records saved to {OUTPUT_CSV.resolve()}")
    log.info(f"Total unique businesses seen across all runs: {len(seen_keys)}")


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY: validate output CSV schema matches Supabase expectation
# ═══════════════════════════════════════════════════════════════════════════════

def validate_output():
    """Quick QA check on the output CSV. Call separately after a run."""
    if not OUTPUT_CSV.exists():
        print("No output file yet.")
        return
    df = pd.read_csv(OUTPUT_CSV)
    print(f"\n{'═'*60}")
    print(f"  OUTPUT VALIDATION REPORT — {OUTPUT_CSV}")
    print(f"{'═'*60}")
    print(f"  Total rows        : {len(df):,}")
    print(f"  Unique names      : {df['name'].nunique():,}")
    print(f"  Rows with phone   : {df['phone'].notna().sum():,}  ({df['phone'].notna().mean()*100:.1f}%)")
    print(f"  Rows with rating  : {df['rating'].notna().sum():,}  ({df['rating'].notna().mean()*100:.1f}%)")
    print(f"  Rows with address : {df['address'].notna().sum():,}  ({df['address'].notna().mean()*100:.1f}%)")
    print(f"  Rows with coords  : {df['latitude'].notna().sum():,}  ({df['latitude'].notna().mean()*100:.1f}%)")
    print(f"\n  By category:")
    print(df.groupby("specialization").size().to_string())
    print(f"\n  Rating distribution:")
    print(df["rating"].describe().to_string())
    print(f"{'═'*60}\n")


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "validate":
        validate_output()
    else:
        asyncio.run(run())
