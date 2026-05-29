from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scrapers.runner import scrape_products


ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 4173
DEFAULT_HOST = "127.0.0.1"
EXPORTS_DIR = ROOT / "exports"


class DashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._json({"ok": True})
            return
        if parsed.path == "/api/products":
            self._json(self._read_product_catalog())
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/export":
            self._handle_export()
            return
        if parsed.path != "/api/scrape":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")
            return

        try:
            payload = self._read_json_body()
            city = str(payload.get("city") or "")
            pincode = str(payload.get("pincode") or "")
            locations = payload.get("locations") or []
            force_refresh = bool(payload.get("forceRefresh"))
            platforms = payload.get("platforms") or []
            products = payload.get("products") or []
            if not isinstance(platforms, list) or not platforms:
                raise ValueError("platforms must be a non-empty list")
            if not isinstance(products, list) or not products:
                raise ValueError("products must be a non-empty list")

            target_locations = self._normalize_locations(locations, city, pincode)
            if not target_locations:
                raise ValueError("at least one city and pincode are required")

            snapshots = []
            for location in target_locations:
                snapshots.extend(
                    scrape_products(
                        products,
                        str(location["city"]),
                        str(location["pincode"]),
                        [str(item) for item in platforms],
                        force_refresh=force_refresh,
                    )
                )
            self._json(
                {
                    "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
                    "locations": target_locations,
                    "products": products,
                    "snapshots": snapshots,
                }
            )
        except Exception as exc:  # noqa: BLE001 - return useful API error to UI.
            self._json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_export(self) -> None:
        try:
            payload = self._read_json_body()
            csv_text = str(payload.get("csv") or "")
            if not csv_text:
                raise ValueError("csv is required")
            requested = str(payload.get("filename") or "pld-comparison.csv")
            filename = self._safe_export_name(requested)
            EXPORTS_DIR.mkdir(exist_ok=True)
            path = EXPORTS_DIR / filename
            path.write_text(csv_text, encoding="utf-8")
            self._json(
                {
                    "filename": filename,
                    "url": f"/exports/{filename}",
                    "path": str(path),
                    "size": path.stat().st_size,
                }
            )
        except Exception as exc:  # noqa: BLE001 - return useful API error to UI.
            self._json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body or "{}")

    def _read_product_catalog(self) -> dict[str, Any]:
        path = ROOT / "data" / "product-links.json"
        if not path.exists():
            return {"products": []}
        return json.loads(path.read_text(encoding="utf-8"))

    def _safe_export_name(self, filename: str) -> str:
        stem = Path(filename).stem or "pld-comparison"
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._") or "pld-comparison"
        timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d-%H%M%S")
        return f"{stem[:80]}-{timestamp}.csv"

    def _normalize_locations(
        self,
        locations: Any,
        city: str,
        pincode: str,
    ) -> list[dict[str, str]]:
        if isinstance(locations, list) and locations:
            output = []
            seen = set()
            for location in locations:
                if not isinstance(location, dict):
                    continue
                loc_city = str(location.get("city") or "").strip()
                loc_pincode = str(location.get("pincode") or "").strip()
                if not loc_city or not loc_pincode:
                    continue
                key = (loc_city, loc_pincode)
                if key in seen:
                    continue
                seen.add(key)
                output.append({"city": loc_city, "pincode": loc_pincode})
            return output
        if city and pincode:
            return [{"city": city, "pincode": pincode}]
        return []

    def _json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    host = os.environ.get("HOST", DEFAULT_HOST)
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    server = ThreadingHTTPServer((host, port), DashboardHandler)
    display_host = "127.0.0.1" if host in {"0.0.0.0", ""} else host
    print(f"Serving dashboard at http://{display_host}:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
