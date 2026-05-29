from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from time import monotonic
from typing import Any

from .common import error_quote, product_link
from .pharmeasy import PharmEasyPLDAdapter
from .tata1mg import Tata1MGScraper
from .truemeds import TruemedsScraper


SCRAPERS = {
    "Tata 1MG": Tata1MGScraper(),
    "Truemeds": TruemedsScraper(),
    "PharmEasy": PharmEasyPLDAdapter(),
}

QUOTE_CACHE_TTL_SECONDS = 10 * 60
MAX_WORKERS = 8
_QUOTE_CACHE: dict[tuple[str, str, str, str, str], tuple[float, dict[str, Any]]] = {}


def scrape_products(
    products: list[dict[str, Any]],
    city: str,
    pincode: str,
    platforms: list[str],
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    tasks = [(product, platform) for product in products for platform in platforms]
    if not tasks:
        return []

    workers = min(MAX_WORKERS, len(tasks))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(lambda item: _scrape_one(item[0], item[1], city, pincode, force_refresh), tasks))


def _scrape_one(
    product: dict[str, Any],
    platform: str,
    city: str,
    pincode: str,
    force_refresh: bool,
) -> dict[str, Any]:
    url = product_link(product, platform)
    key = (
        str(product.get("id") or product.get("ucode") or product.get("name") or ""),
        platform,
        city,
        str(pincode),
        url,
    )
    cached = _QUOTE_CACHE.get(key)
    if cached and not force_refresh and monotonic() - cached[0] <= QUOTE_CACHE_TTL_SECONDS:
        quote = deepcopy(cached[1])
        quote["source"] = f"{quote.get('source') or 'cache'}_cached"
        return quote

    scraper = SCRAPERS.get(platform)
    if not scraper:
        quote = error_quote(
            product,
            platform,
            city,
            pincode,
            url,
            f"No scraper configured for {platform}",
        ).to_dict()
    else:
        quote = scraper.scrape(product, city, pincode).to_dict()

    _QUOTE_CACHE[key] = (monotonic(), deepcopy(quote))
    return quote
