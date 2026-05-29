from __future__ import annotations

from typing import Any

from .common import Quote, discount_pct, error_quote, now_iso, number, product_id_from_url, product_link


class PharmEasyPLDAdapter:
    platform = "PharmEasy"

    def scrape(self, product: dict[str, Any], city: str, pincode: str) -> Quote:
        pld = product.get("pharmeasyPld") or product.get("pharmEasyPld") or product.get("pld") or {}
        if not isinstance(pld, dict) or not pld:
            return error_quote(
                product,
                self.platform,
                city,
                pincode,
                product_link(product, self.platform),
                "No PharmEasy PLD supplied yet",
            )

        url = product_link(product, self.platform) or str(pld.get("url") or "")
        mrp = number(pld.get("mrp") or product.get("mrp"))
        price = number(pld.get("price") or pld.get("selling_price") or pld.get("sellingPrice"))
        discount = number(pld.get("discountPct") or pld.get("discount_pct") or pld.get("discount")) or discount_pct(
            mrp, price
        )
        if discount is None:
            return error_quote(
                product,
                self.platform,
                city,
                pincode,
                url,
                "No PharmEasy PLD discount supplied",
            )

        return Quote(
            productId=str(product.get("id") or product_id_from_url(url) or product.get("name") or "product"),
            productName=str(product.get("name") or pld.get("product_name") or product_id_from_url(url)),
            platform=self.platform,
            city=city,
            pincode=str(pincode),
            mrp=mrp,
            price=price,
            stock=str(pld.get("stock") or pld.get("availability") or "PLD"),
            url=url,
            updatedAt=str(pld.get("updatedAt") or pld.get("updated_at") or now_iso()),
            pack=str(product.get("pack") or pld.get("pack") or ""),
            salt=str(product.get("salt") or pld.get("salt") or ""),
            category=str(product.get("category") or pld.get("category") or ""),
            discountPct=discount,
            eta=str(pld.get("eta") or ""),
            source="pharmeasy_pld",
        )
