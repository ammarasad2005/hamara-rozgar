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
    Two-phase extraction strategy:
    Phase 1 — Collect all place URLs and names from the feed WITHOUT clicking.
              The <a class="hfpxzc"> anchor in Google Maps is an invisible overlay;
              calling .click() on it always times out ("element is not visible").
              Instead we read href + aria-label attributes directly.
    Phase 2 — Navigate to each place URL via page.goto() and scrape the detail page.
              This is clean, reliable, and fully avoids the click timeout issue.
    Also filters results to Pakistan's geographic bounding box to reject
    international results Google Maps sometimes injects when local supply is thin.
    """
    # ── Pakistan geographic bounding box ──────────────────────────────────────
    # Rawalpindi/Islamabad region with generous margin (roughly 30.0–37.0 N, 69.0–77.0 E)
    PAK_LAT_MIN, PAK_LAT_MAX = 30.0, 37.0
    PAK_LON_MIN, PAK_LON_MAX = 69.0, 77.0

    def is_in_pakistan(lat, lon) -> bool:
        if lat is None or lon is None:
            return True  # unknown coords: allow through, will be filtered by dedup
        return PAK_LAT_MIN <= lat <= PAK_LAT_MAX and PAK_LON_MIN <= lon <= PAK_LON_MAX

    results: list[Provider] = []

    # ── PHASE 1: Harvest all place URLs from the feed (no clicking) ───────────
    cards_locator = page.locator(SEL_RESULT_ITEMS)
    card_count = await cards_locator.count()
    log.info(f"Found {card_count} result cards in feed.")

    place_entries: list[tuple[str, str]] = []  # (place_url, name_hint)
    for idx in range(card_count):
        try:
            card = cards_locator.nth(idx)
            href  = (await card.get_attribute("href") or "").strip()
            name  = (await card.get_attribute("aria-label") or "").strip()
            if href and "/maps/place/" in href and len(name) >= 2:
                place_entries.append((href, name))
        except Exception as e:
            log.debug(f"Could not harvest card {idx}: {e}")

    log.info(f"Harvested {len(place_entries)} place URLs to visit.")

    # ── PHASE 2: Navigate to each place URL and scrape its detail page ─────────
    results_page_url = page.url  # save search results URL to return to if needed

    for place_url, name_hint in place_entries:
        biz_name = name_hint
        try:
            # Pre-check coordinates from the href itself (fastest path, no page load needed)
            pre_lat, pre_lon = parse_coords_from_url(place_url)
            if not is_in_pakistan(pre_lat, pre_lon):
                log.debug(f"Skipping non-Pakistan result: {name_hint} ({pre_lat},{pre_lon})")
                continue

            # Navigate directly to the place detail page.
            # Use "load" (not "domcontentloaded") so JS-rendered content is available.
            await page.goto(place_url, wait_until="load", timeout=35_000)

            # Explicitly wait for the detail panel h1 to appear — this is the
            # most reliable signal that Google Maps has finished rendering the
            # business info (rating, phone, address load after DOM is ready).
            try:
                await page.wait_for_selector(
                    'h1, [data-attrid="title"]', timeout=8_000
                )
            except Exception:
                pass  # continue and scrape whatever loaded
            human_delay(0.8, 1.5)  # small additional buffer for JS widgets

            detail_url = page.url
            lat, lon = parse_coords_from_url(detail_url)
            if lat is None:
                lat, lon = pre_lat, pre_lon  # fall back to href coords

            # Final geography check (URL may have redirected to a different place)
            if not is_in_pakistan(lat, lon):
                log.debug(f"Skipping after redirect (non-Pakistan): {biz_name} ({lat},{lon})")
                await page.go_back(wait_until="domcontentloaded", timeout=15_000)
                continue

            # ── Business name (re-read from detail page h1 for accuracy) ──────
            try:
                name_detail = await page.locator('h1').first.inner_text(timeout=4_000)
                biz_name = name_detail.strip() or biz_name
            except Exception:
                pass

            # ── Rating ────────────────────────────────────────────────────────
            # Google Maps renders: <button aria-label="4.5 stars 123 reviews">
            # This aria-label is the most stable signal across DOM changes.
            rating = None
            try:
                # Try the aria-label approach first (most reliable)
                rating_btn = await page.query_selector('[aria-label*=" stars"]')
                if rating_btn:
                    aria = await rating_btn.get_attribute("aria-label") or ""
                    m = re.search(r"([\d.]+)\s+star", aria)
                    if m:
                        rating = float(m.group(1))
                if rating is None:
                    # Fallback: visible rating text inside feed card classes
                    for sel in ['span[aria-hidden="true"].fontDisplayLarge',
                                '.MW4etd', 'span[aria-hidden="true"]']:
                        el = await page.query_selector(sel)
                        if el:
                            txt = (await el.inner_text()).strip().replace(",", ".")
                            try:
                                candidate = float(txt)
                                if 1.0 <= candidate <= 5.0:
                                    rating = candidate
                                    break
                            except ValueError:
                                pass
            except Exception:
                pass

            # ── Review count ──────────────────────────────────────────────────
            review_count = None
            try:
                # aria-label on the rating button usually contains review count too
                rating_btn = await page.query_selector('[aria-label*=" stars"]')
                if rating_btn:
                    aria = await rating_btn.get_attribute("aria-label") or ""
                    m = re.search(r"([\d,]+)\s+review", aria)
                    if m:
                        review_count = int(m.group(1).replace(",", ""))
                if review_count is None:
                    review_el = await page.query_selector('[aria-label*="reviews"]')
                    if review_el:
                        rc_text = await review_el.get_attribute("aria-label") or ""
                        m = re.search(r"([\d,]+)", rc_text)
                        if m:
                            review_count = int(m.group(1).replace(",", ""))
            except Exception:
                pass

            # ── Phone ─────────────────────────────────────────────────────────
            # Google Maps renders phone as: <a href="tel:+923169625448">+92 316 9625448</a>
            # This is the most reliable selector — standard HTML tel: protocol.
            phone = None
            try:
                # PRIMARY: tel: href link — always present when a phone is listed
                phone_link = await page.query_selector('a[href^="tel:"]')
                if phone_link:
                    href = await phone_link.get_attribute("href") or ""
                    raw_phone = href.replace("tel:", "").strip()
                    phone = normalise_phone(raw_phone)

                if not phone:
                    # SECONDARY: button/element with data-item-id containing phone number
                    phone_el = await page.query_selector(
                        'button[data-item-id*="phone:tel"], '
                        '[data-item-id*="phone:tel"]'
                    )
                    if phone_el:
                        item_id = await phone_el.get_attribute("data-item-id") or ""
                        if "tel:" in item_id:
                            phone = normalise_phone(item_id.split("tel:")[-1])

                if not phone:
                    # TERTIARY: full-body Pakistani phone pattern regex
                    all_text = await page.inner_text("body")
                    phone_matches = re.findall(
                        r"(?:\+92|0)(?:3\d{2}|51|42|21)\s*[-.\s]?\d{3}\s*[-.\s]?\d{4}", all_text
                    )
                    if phone_matches:
                        phone = normalise_phone(phone_matches[0])
            except Exception:
                pass


            # ── Address ───────────────────────────────────────────────────────
            # Google Maps renders: <button data-item-id="address">Street, City</button>
            address = None
            try:
                addr_btn = await page.query_selector(
                    'button[data-item-id="address"], '
                    'button[data-item-id*="address"], '
                    '[aria-label*="Address"]'
                )
                if addr_btn:
                    address = (await addr_btn.inner_text()).strip()
                if not address:
                    # Fallback: look for the address copyable text element
                    for sel in ['.rogA2c .Io6YTe', '[class*="LrzXr"]', 'button[jsaction*="address"]']:
                        el = await page.query_selector(sel)
                        if el:
                            candidate = (await el.inner_text()).strip()
                            if candidate and len(candidate) > 5:
                                address = candidate
                                break
            except Exception:
                pass

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
            log.info(f"  ✓ Scraped [{len(results)}/{len(place_entries)}]: {biz_name} | {phone} | {rating}★ | ({lat:.4f},{lon:.4f})")

            # Go back to search results for the next place
            await page.go_back(wait_until="domcontentloaded", timeout=15_000)
            human_delay(0.8, 1.5)

        except Exception as e:
            log.warning(f"Error visiting place '{biz_name}': {e}")
            # Best-effort navigation back to results
            try:
                if results_page_url and results_page_url not in page.url:
                    await page.goto(results_page_url, wait_until="domcontentloaded", timeout=20_000)
                    human_delay(1.0, 2.0)
                else:
                    await page.go_back(wait_until="domcontentloaded", timeout=15_000)
            except Exception:
                pass
            continue

        # Small pause between businesses
        human_delay(MIN_DELAY * 0.5, MAX_DELAY * 0.5)

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
