from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "product-links.json"
OVERALL_PATH = Path("/Users/prasoon.jha/Downloads/Overall Level PLD Everything.csv")
CITY_PATH = Path("/Users/prasoon.jha/Downloads/City Level PLD Everything.csv")

LOCATIONS = [
    {"city": "Bangalore", "pincode": "560001", "metricCity": "Bengaluru"},
    {"city": "Mumbai", "pincode": "400001", "metricCity": "Mumbai"},
    {"city": "New Delhi", "pincode": "110001", "metricCity": "Delhi"},
    {"city": "Ahmedabad", "pincode": "380001", "metricCity": "Ahmedabad"},
    {"city": "Guwahati", "pincode": "781001", "metricCity": "Guwahati"},
    {"city": "Kolkata", "pincode": "700001", "metricCity": "Kolkata"},
    {"city": "Chennai", "pincode": "600001", "metricCity": "Chennai"},
    {"city": "Hyderabad", "pincode": "500001", "metricCity": "Hyderabad"},
    {"city": "Pune", "pincode": "411001", "metricCity": "Pune"},
    {"city": "Jaipur", "pincode": "302001", "metricCity": "Jaipur"},
    {"city": "Lucknow", "pincode": "226001", "metricCity": "Lucknow"},
    {"city": "Chandigarh", "pincode": "160017", "metricCity": "Chandigarh"},
    {"city": "Bhopal", "pincode": "462001", "metricCity": "Bhopal"},
    {"city": "Indore", "pincode": "452001", "metricCity": "Indore"},
    {"city": "Patna", "pincode": "800001", "metricCity": "Patna"},
    {"city": "Bhubaneswar", "pincode": "751001", "metricCity": "Bhubaneswar"},
    {"city": "Kochi", "pincode": "682001", "metricCity": "Cochin"},
    {"city": "Coimbatore", "pincode": "641001", "metricCity": "Coimbatore"},
    {"city": "Nagpur", "pincode": "440001", "metricCity": "Nagpur"},
    {"city": "Surat", "pincode": "395003", "metricCity": "Surat"},
    {"city": "Vadodara", "pincode": "390001", "metricCity": "Vadodara"},
    {"city": "Visakhapatnam", "pincode": "530001", "metricCity": "Visakhapatnam"},
]


def num(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def pld_decimal(value: Any) -> float:
    parsed = num(value)
    if abs(parsed) > 1:
        return parsed / 100
    return parsed


def new_acc() -> dict[str, float]:
    return {
        "salesMrp": 0.0,
        "pldBurn": 0.0,
        "reportedDiscount": 0.0,
        "soldQty": 0.0,
        "soldValue": 0.0,
        "eprValue": 0.0,
        "brandDiscount": 0.0,
    }


def add_row(acc: dict[str, float], row: dict[str, str]) -> None:
    sales_mrp = num(row.get("sales_abetted_mrp"))
    pld = pld_decimal(row.get("pld_perc"))
    acc["salesMrp"] += sales_mrp
    acc["pldBurn"] += sales_mrp * pld
    acc["reportedDiscount"] += num(row.get("ucode_discount"))
    acc["soldQty"] += num(row.get("ucode_sold_qty"))
    acc["soldValue"] += num(row.get("ucode_sold_value"))
    acc["eprValue"] += num(row.get("epr_value"))
    acc["brandDiscount"] += num(row.get("brand_discount"))


def clean_number(value: float, digits: int = 2) -> float:
    rounded = round(float(value), digits)
    if rounded == -0:
        return 0.0
    return rounded


def to_metric(acc: dict[str, float], source: str, city: str | None = None) -> dict[str, Any]:
    sales_mrp = acc["salesMrp"]
    pld_burn = acc["pldBurn"] if acc["pldBurn"] else acc["reportedDiscount"]
    discount_pct = (pld_burn / sales_mrp) * 100 if sales_mrp else None
    metric: dict[str, Any] = {
        "salesMrp": clean_number(sales_mrp),
        "pldBurn": clean_number(pld_burn),
        "discountPct": clean_number(discount_pct, 4) if discount_pct is not None else None,
        "soldQty": clean_number(acc["soldQty"]),
        "soldValue": clean_number(acc["soldValue"]),
        "eprValue": clean_number(acc["eprValue"]),
        "reportedDiscount": clean_number(acc["reportedDiscount"]),
        "brandDiscount": clean_number(acc["brandDiscount"]),
        "source": source,
    }
    if city:
        metric["city"] = city
    return metric


def aggregate_overall(ucodes: set[str]) -> dict[str, dict[str, Any]]:
    acc_by_ucode: dict[str, dict[str, float]] = defaultdict(new_acc)
    with OVERALL_PATH.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            ucode = (row.get("ucode") or "").strip()
            if ucode in ucodes:
                add_row(acc_by_ucode[ucode], row)
    return {ucode: to_metric(acc, OVERALL_PATH.name) for ucode, acc in acc_by_ucode.items()}


def aggregate_city(ucodes: set[str], target_cities: set[str]) -> dict[str, dict[str, dict[str, Any]]]:
    acc_by_ucode_city: dict[tuple[str, str], dict[str, float]] = defaultdict(new_acc)
    with CITY_PATH.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            ucode = (row.get("ucode") or "").strip()
            city = (row.get("delivery_city_name") or "").strip()
            if ucode in ucodes and city in target_cities:
                add_row(acc_by_ucode_city[(ucode, city)], row)

    city_metrics: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for (ucode, city), acc in acc_by_ucode_city.items():
        city_metrics[ucode][city] = to_metric(acc, CITY_PATH.name, city)
    return dict(city_metrics)


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    products = catalog.get("products", [])
    ucodes = {str(product.get("ucode") or product.get("id") or "").strip() for product in products}
    ucodes.discard("")

    overall_metrics = aggregate_overall(ucodes)
    target_cities = {location["metricCity"] for location in LOCATIONS}
    city_metrics = aggregate_city(ucodes, target_cities)

    for product in products:
        ucode = str(product.get("ucode") or product.get("id") or "").strip()
        existing_pe = dict(product.get("pharmeasyPld") or {})
        if "discountPct" in existing_pe and "mappingDiscountPct" not in existing_pe:
            existing_pe["mappingDiscountPct"] = existing_pe.get("discountPct")

        overall = overall_metrics.get(ucode)
        if overall:
            product["overallPld"] = overall
            product["salesMrp"] = overall["salesMrp"]
            product["pldBurn"] = overall["pldBurn"]
            product["currentPldPct"] = overall["discountPct"]
            product["pharmeasyPld"] = {
                **existing_pe,
                "discountPct": overall["discountPct"],
                "salesMrp": overall["salesMrp"],
                "pldBurn": overall["pldBurn"],
                "source": OVERALL_PATH.name,
            }
        else:
            product["pharmeasyPld"] = existing_pe

        if city_metrics.get(ucode):
            product["cityPld"] = city_metrics[ucode]

    catalog["generatedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    catalog["locations"] = LOCATIONS
    catalog["sourceFiles"] = {
        **(catalog.get("sourceFiles") or {}),
        "overallPld": str(OVERALL_PATH),
        "cityPld": str(CITY_PATH),
    }
    catalog["products"] = products
    catalog.pop("snapshots", None)

    CATALOG_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "products": len(products),
                "overallMatched": len(overall_metrics),
                "cityMatched": len(city_metrics),
                "locations": len(LOCATIONS),
                "catalog": str(CATALOG_PATH),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
