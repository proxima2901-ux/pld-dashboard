from __future__ import annotations

import html
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
}


@dataclass
class Quote:
    productId: str
    productName: str
    platform: str
    city: str
    pincode: str
    mrp: float | None
    price: float | None
    stock: str
    url: str
    updatedAt: str
    pack: str = ""
    salt: str = ""
    category: str = ""
    discountPct: float | None = None
    eta: str = ""
    source: str = ""
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def fetch_text(url: str, headers: dict[str, str] | None = None, timeout: int = 25) -> str:
    merged_headers = {**DEFAULT_HEADERS, **(headers or {})}
    request = Request(url, headers=merged_headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "replace")
    except HTTPError as exc:
        body = exc.read(800).decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body[:240]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error from {url}: {exc.reason}") from exc


def fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 25) -> Any:
    text = fetch_text(
        url,
        {
            "Accept": "application/json, text/plain, */*",
            **(headers or {}),
        },
        timeout,
    )
    return json.loads(text)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    text = html.unescape(text)
    text = re.sub(r"[^0-9.\-]", "", text)
    if not text or text in {".", "-", "-."}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def discount_pct(mrp: float | None, price: float | None) -> float | None:
    if not mrp or price is None:
        return None
    return max(0.0, round(((mrp - price) / mrp) * 100, 2))


def get_nested(data: Any, *path: str, default: Any = None) -> Any:
    current = data
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def extract_json_ld(html_text: str) -> list[Any]:
    blocks = []
    pattern = re.compile(
        r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(html_text):
        raw = html.unescape(match.group(1).strip())
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return blocks


def find_json_assignment(html_text: str, marker: str) -> dict[str, Any] | None:
    start = html_text.find(marker)
    if start == -1:
        return None
    start += len(marker)
    while start < len(html_text) and html_text[start].isspace():
        start += 1
    if start >= len(html_text) or html_text[start] != "{":
        return None

    level = 0
    in_string = False
    escape = False
    for index in range(start, len(html_text)):
        char = html_text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            level += 1
        elif char == "}":
            level -= 1
            if level == 0:
                return json.loads(html_text[start : index + 1])
    return None


def product_link(product: dict[str, Any], platform: str) -> str:
    links = product.get("links") or product.get("urls") or {}
    aliases = {
        "Tata 1MG": ["Tata 1MG", "1MG", "Tata1MG", "tata1mg", "1mg"],
        "Truemeds": ["Truemeds", "Truemed", "true meds", "truemeds", "true_meds"],
        "PharmEasy": ["PharmEasy", "Pharmeasy", "pharmeasy", "pharmEasy"],
    }
    for key in aliases.get(platform, [platform]):
        if links.get(key):
            return str(links[key])
    return ""


def product_id_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    slug = path.split("/")[-1] if path else url
    return re.sub(r"[^a-zA-Z0-9]+", "-", slug).strip("-").lower()


def error_quote(
    product: dict[str, Any],
    platform: str,
    city: str,
    pincode: str,
    url: str,
    message: str,
) -> Quote:
    return Quote(
        productId=str(product.get("id") or product_id_from_url(url) or product.get("name") or "product"),
        productName=str(product.get("name") or product.get("productName") or product_id_from_url(url)),
        platform=platform,
        city=city,
        pincode=pincode,
        mrp=number(product.get("mrp")),
        price=None,
        stock="Error",
        url=url,
        updatedAt=now_iso(),
        pack=str(product.get("pack") or ""),
        salt=str(product.get("salt") or ""),
        category=str(product.get("category") or ""),
        source="error",
        error=message,
    )
