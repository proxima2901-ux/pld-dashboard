from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, urlparse

from .common import (
    Quote,
    clean_text,
    discount_pct,
    error_quote,
    fetch_json,
    fetch_text,
    get_nested,
    now_iso,
    number,
    product_id_from_url,
    product_link,
)


class Tata1MGScraper:
    platform = "Tata 1MG"

    def scrape(self, product: dict[str, Any], city: str, pincode: str) -> Quote:
        url = product_link(product, self.platform)
        if not url:
            return error_quote(product, self.platform, city, pincode, "", "Missing Tata 1MG URL")

        sku_id = self._extract_sku_id(url)
        if not sku_id:
            return error_quote(product, self.platform, city, pincode, url, "Could not detect 1MG SKU id")

        headers = {
            "Referer": url,
            "Cookie": f"city={quote(city)}; pincode={quote(str(pincode))};",
            "x-platform": "web",
        }
        sku_kinds = self._candidate_sku_kinds(url)
        last_error = ""

        for sku_kind in sku_kinds:
            try:
                static_data = self._fetch_static(sku_id, sku_kind, city, headers)
                dynamic_data = self._fetch_dynamic(sku_id, sku_kind, city, pincode, headers)
                return self._quote_from_api(product, url, sku_kind, static_data, dynamic_data, city, pincode)
            except Exception as exc:  # noqa: BLE001 - adapter should continue to fallback kind.
                last_error = str(exc)

        try:
            return self._quote_from_html(product, url, city, pincode, headers)
        except Exception as exc:  # noqa: BLE001
            message = f"{last_error}; fallback failed: {exc}" if last_error else str(exc)
            return error_quote(product, self.platform, city, pincode, url, message)

    def _fetch_static(self, sku_id: str, sku_kind: str, city: str, headers: dict[str, str]) -> dict[str, Any]:
        endpoint = (
            "https://www.1mg.com/pharmacy_api_static_gateway/v4/"
            f"{sku_kind}/{sku_id}/static?city={quote(city)}&locale=en&show_widgets=true&client=web"
        )
        payload = fetch_json(endpoint, headers)
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("1MG static endpoint did not return data")
        return data

    def _fetch_dynamic(
        self,
        sku_id: str,
        sku_kind: str,
        city: str,
        pincode: str,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        endpoint = (
            "https://www.1mg.com/pharmacy_api_gateway/v4/"
            f"{sku_kind}/{sku_id}/dynamic?city={quote(city)}&eta_pincode={quote(str(pincode))}"
            "&eta_address_name=&eta_address_id=&locale=en&client=web"
        )
        payload = fetch_json(endpoint, headers)
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("1MG dynamic endpoint did not return data")
        return data

    def _quote_from_api(
        self,
        product: dict[str, Any],
        url: str,
        sku_kind: str,
        static_data: dict[str, Any],
        dynamic_data: dict[str, Any],
        city: str,
        pincode: str,
    ) -> Quote:
        sku = static_data.get("sku") or {}
        schema = get_nested(static_data, "schema", "drug", default={}) or {}
        name = sku.get("name") or schema.get("name") or product.get("name") or product_id_from_url(url)
        pack = sku.get("quantity_in_pack") or schema.get("drugUnit") or product.get("pack") or ""
        salt = clean_text(get_nested(sku, "short_composition", "display_text", default="")) or clean_text(
            schema.get("activeIngredient")
        )
        mrp = number(dynamic_data.get("price")) or number(get_nested(schema, "offers", "price"))
        selling_price = (
            number(get_nested(dynamic_data, "discount", "price"))
            or number(get_nested(dynamic_data, "best_price", "price"))
            or number(get_nested(dynamic_data, "best_price", "discounted_price"))
            or number(get_nested(schema, "offers", "price"))
        )
        discount = number(get_nested(dynamic_data, "discount", "percent")) or discount_pct(mrp, selling_price)
        available = bool(dynamic_data.get("available")) and not dynamic_data.get("out_of_stock")
        stock = "In stock" if available else "Out of stock"
        eta = clean_text(get_nested(dynamic_data, "eta_data", "eta_widget", "header", default=""))

        return Quote(
            productId=str(product.get("id") or product_id_from_url(url)),
            productName=str(name),
            platform=self.platform,
            city=city,
            pincode=str(pincode),
            mrp=mrp,
            price=selling_price,
            stock=stock,
            url=url,
            updatedAt=now_iso(),
            pack=str(pack),
            salt=str(salt or product.get("salt") or ""),
            category=str(product.get("category") or sku_kind.replace("_skus", "")),
            discountPct=discount,
            eta=eta,
            source=f"1mg_{sku_kind}_dynamic_api",
        )

    def _quote_from_html(
        self,
        product: dict[str, Any],
        url: str,
        city: str,
        pincode: str,
        headers: dict[str, str],
    ) -> Quote:
        html_text = fetch_text(url, headers)
        from .common import extract_json_ld

        drug = None
        for block in extract_json_ld(html_text):
            candidates = block if isinstance(block, list) else [block]
            for candidate in candidates:
                if isinstance(candidate, dict) and candidate.get("@type") in {"Drug", "Product"}:
                    drug = candidate
                    break
            if drug:
                break
        if not drug:
            raise RuntimeError("No 1MG JSON-LD product block found")

        offer = drug.get("offers") or {}
        price = number(offer.get("price"))
        availability = str(offer.get("availability") or "")
        stock = "Out of stock" if "OutOfStock" in availability else "In stock"
        return Quote(
            productId=str(product.get("id") or product_id_from_url(url)),
            productName=str(drug.get("name") or product.get("name") or product_id_from_url(url)),
            platform=self.platform,
            city=city,
            pincode=str(pincode),
            mrp=number(product.get("mrp")) or price,
            price=price,
            stock=stock,
            url=url,
            updatedAt=now_iso(),
            pack=str(drug.get("drugUnit") or product.get("pack") or ""),
            salt=clean_text(drug.get("activeIngredient") or product.get("salt") or ""),
            category=str(product.get("category") or ""),
            discountPct=discount_pct(number(product.get("mrp")) or price, price),
            source="1mg_json_ld_fallback",
        )

    def _extract_sku_id(self, url: str) -> str:
        path = urlparse(url).path
        match = re.search(r"(\d+)(?:\D*)$", path)
        return match.group(1) if match else ""

    def _candidate_sku_kinds(self, url: str) -> list[str]:
        path = urlparse(url).path.lower()
        if "/otc/" in path:
            return ["otc_skus", "drug_skus"]
        return ["drug_skus", "otc_skus"]

