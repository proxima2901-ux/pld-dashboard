from __future__ import annotations

import html
import json
import re
from typing import Any
from urllib.parse import quote

from .common import (
    Quote,
    clean_text,
    discount_pct,
    error_quote,
    extract_json_ld,
    fetch_json,
    fetch_text,
    get_nested,
    now_iso,
    number,
    product_id_from_url,
    product_link,
)


class TruemedsScraper:
    platform = "Truemeds"

    def scrape(self, product: dict[str, Any], city: str, pincode: str) -> Quote:
        url = product_link(product, self.platform)
        if not url:
            return error_quote(product, self.platform, city, pincode, "", "Missing Truemeds URL")

        try:
            serviceability = self._fetch_serviceability(pincode)
            headers = self._headers(url, city, pincode, serviceability)
            html_text = fetch_text(url, headers)
            next_data = self._extract_next_data(html_text)
            pdp_product = self._find_pdp_product(next_data)
            if pdp_product:
                return self._quote_from_pdp_product(product, url, pdp_product, serviceability, city, pincode)
            return self._quote_from_json_ld(product, url, html_text, serviceability, city, pincode)
        except Exception as exc:  # noqa: BLE001 - surface adapter errors in the dashboard row.
            return error_quote(product, self.platform, city, pincode, url, str(exc))

    def _fetch_serviceability(self, pincode: str) -> dict[str, Any]:
        endpoint = (
            "https://nal.tmmumbai.in/CustomerService/v1/checkPincodeServiceability"
            f"?pincode={quote(str(pincode))}"
        )
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://www.truemeds.in",
            "Referer": "https://www.truemeds.in/",
            "client-platform": "WEBSITE",
            "platform": "WEBSITE",
        }
        try:
            payload = fetch_json(endpoint, headers)
        except Exception as exc:  # noqa: BLE001 - PDP still carries national price if this fails.
            return {"servicable": False, "error": str(exc)}

        response_data = payload.get("responseData") if isinstance(payload, dict) else {}
        response_data = response_data if isinstance(response_data, dict) else {}
        pincode_rows = response_data.get("pincodeData") if isinstance(response_data.get("pincodeData"), list) else []
        first_row = pincode_rows[0] if pincode_rows and isinstance(pincode_rows[0], dict) else {}
        return {
            "servicable": bool(response_data.get("servicable")),
            "city": first_row.get("city") or "",
            "state": first_row.get("state") or "",
            "warehouseId": first_row.get("warehouseId"),
            "hubId": first_row.get("hubId"),
        }

    def _headers(
        self,
        url: str,
        city: str,
        pincode: str,
        serviceability: dict[str, Any],
    ) -> dict[str, str]:
        cookie_payload = {
            "pincode": str(pincode),
            "city": serviceability.get("city") or city,
            "warehouseId": serviceability.get("warehouseId"),
            "isServiceable": bool(serviceability.get("servicable")),
            "pincodeData": serviceability.get("city") or city,
            "state": serviceability.get("state") or "",
        }
        compact_cookie = json.dumps(cookie_payload, separators=(",", ":"))
        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://www.truemeds.in/",
            "Cookie": (
                f"pincode={quote(str(pincode))}; selectedPincode={quote(str(pincode))}; "
                f"pincodeDetails={quote(compact_cookie)};"
            ),
            "client-platform": "WEBSITE",
            "platform": "WEBSITE",
            "x-platform": "WEBSITE",
            "Origin": "https://www.truemeds.in",
        }

    def _extract_next_data(self, html_text: str) -> dict[str, Any]:
        match = re.search(
            r"<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>",
            html_text,
            re.IGNORECASE | re.DOTALL,
        )
        if not match:
            raise RuntimeError("Truemeds __NEXT_DATA__ block was not found")
        return json.loads(html.unescape(match.group(1).strip()))

    def _find_pdp_product(self, next_data: dict[str, Any]) -> dict[str, Any]:
        page_props = get_nested(next_data, "props", "pageProps", default={}) or {}
        candidates = [
            get_nested(page_props, "currentMed", "product", default=None),
            get_nested(
                page_props,
                "initialState",
                "productPageReducer",
                "currentOpenedMed",
                "product",
                default=None,
            ),
        ]
        for candidate in candidates:
            if isinstance(candidate, dict) and self._looks_like_product(candidate):
                return candidate

        found = self._find_product_recursive(page_props)
        return found or {}

    def _find_product_recursive(self, value: Any, depth: int = 0) -> dict[str, Any] | None:
        if depth > 8:
            return None
        if isinstance(value, dict):
            if self._looks_like_product(value):
                return value
            for child in value.values():
                found = self._find_product_recursive(child, depth + 1)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = self._find_product_recursive(child, depth + 1)
                if found:
                    return found
        return None

    def _looks_like_product(self, value: dict[str, Any]) -> bool:
        has_name = bool(value.get("skuName") or value.get("name"))
        has_code = bool(value.get("productCode") or value.get("skuCode"))
        has_price = any(key in value for key in ("sellingPrice", "mrp", "discount"))
        return has_name and (has_code or has_price)

    def _quote_from_pdp_product(
        self,
        product: dict[str, Any],
        url: str,
        pdp_product: dict[str, Any],
        serviceability: dict[str, Any],
        city: str,
        pincode: str,
    ) -> Quote:
        mrp = number(pdp_product.get("mrp")) or number(product.get("mrp"))
        selling_price = (
            number(pdp_product.get("sellingPrice"))
            or number(pdp_product.get("selling_price"))
            or number(pdp_product.get("price"))
        )
        discount = number(pdp_product.get("discount")) or discount_pct(mrp, selling_price)
        available = pdp_product.get("available")
        is_serviceable = bool(serviceability.get("servicable"))
        if available is False:
            stock = "Out of stock"
        elif not is_serviceable:
            stock = "Pincode unserviceable"
        else:
            stock = "In stock"

        resolved_city = serviceability.get("city") or ""
        warehouse_id = serviceability.get("warehouseId")
        eta_parts = []
        if resolved_city:
            eta_parts.append(f"Serviceable in {resolved_city}")
        if warehouse_id:
            eta_parts.append(f"warehouse {warehouse_id}")

        return Quote(
            productId=str(product.get("id") or pdp_product.get("productCode") or product_id_from_url(url)),
            productName=str(pdp_product.get("skuName") or pdp_product.get("name") or product.get("name")),
            platform=self.platform,
            city=city,
            pincode=str(pincode),
            mrp=mrp,
            price=selling_price,
            stock=stock,
            url=url,
            updatedAt=now_iso(),
            pack=clean_text(pdp_product.get("packForm") or product.get("pack") or ""),
            salt=clean_text(pdp_product.get("composition") or product.get("salt") or ""),
            category=clean_text(
                pdp_product.get("superCategoryName")
                or pdp_product.get("categoryName")
                or product.get("category")
                or ""
            ),
            discountPct=discount,
            eta="; ".join(eta_parts),
            source="truemeds_next_data",
        )

    def _quote_from_json_ld(
        self,
        product: dict[str, Any],
        url: str,
        html_text: str,
        serviceability: dict[str, Any],
        city: str,
        pincode: str,
    ) -> Quote:
        product_block = None
        for block in extract_json_ld(html_text):
            candidates = block if isinstance(block, list) else [block]
            for candidate in candidates:
                if isinstance(candidate, dict) and candidate.get("@type") in {"Drug", "Product"}:
                    product_block = candidate
                    break
            if product_block:
                break
        if not product_block:
            raise RuntimeError("No Truemeds product data found")

        offer = product_block.get("offers") or {}
        price = number(offer.get("price"))
        mrp = number(product.get("mrp")) or price
        availability = str(offer.get("availability") or "")
        stock = "Out of stock" if "OutOfStock" in availability else "In stock"
        if not serviceability.get("servicable"):
            stock = "Pincode unserviceable"

        return Quote(
            productId=str(product.get("id") or product_block.get("sku") or product_id_from_url(url)),
            productName=str(product_block.get("name") or product.get("name") or product_id_from_url(url)),
            platform=self.platform,
            city=city,
            pincode=str(pincode),
            mrp=mrp,
            price=price,
            stock=stock,
            url=url,
            updatedAt=now_iso(),
            pack=clean_text(product.get("pack") or ""),
            salt=clean_text(product.get("salt") or ""),
            category=clean_text(product.get("category") or ""),
            discountPct=discount_pct(mrp, price),
            eta=str(serviceability.get("city") or ""),
            source="truemeds_json_ld_fallback",
        )
