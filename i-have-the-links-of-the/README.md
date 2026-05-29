# Product PLD Dashboard

Local dashboard for comparing Tata 1MG and Truemeds live PDP discounts against the PharmEasy PLD benchmark and current burn supplied in CSV files.

## Run

```bash
python3 server.py
```

Open `http://127.0.0.1:4173`.

## Host And Share

This version needs the Python server because live fetching and CSV export call `/api/scrape` and `/api/export`.

Fast temporary sharing:

```bash
python3 server.py
ngrok http 4173
```

Use the public `https://...ngrok-free.app` URL ngrok gives you.

Persistent public hosting:

1. Push this folder to a GitHub repo.
2. Create a Render web service from the repo.
3. Render will read `render.yaml`.
4. Share the deployed `https://...onrender.com` URL.

For any other host, use:

```bash
HOST=0.0.0.0 PORT=$PORT python3 server.py
```

Keep these files committed for hosting:

- `index.html`
- `app.js`
- `styles.css`
- `server.py`
- `render.yaml`
- `scrapers/`
- `data/product-links.json`

## Current Catalog

The product catalog is generated from:

```text
/Users/prasoon.jha/Downloads/Pricing PLD .csv - Mapping links(1).csv
```

Overall PharmEasy revenue, PLD burn, and current PLD are merged from:

```text
/Users/prasoon.jha/Downloads/Overall Level PLD Everything.csv
```

City-level PharmEasy revenue and PLD are merged from:

```text
/Users/prasoon.jha/Downloads/City Level PLD Everything.csv
```

Loaded mapping fields:

- `ucode`
- `product_name`
- `product_type`
- `1MG Link`
- `Truemeds Link`
- `PLD Discound on MRP for Pharmeasy`

Loaded PLD fields:

- `delivery_city_name`
- `sales_abetted_mrp`
- `ucode_discount`
- `pld_perc`
- `product_name`

The dashboard keeps 22 city and pincode contexts ready:

- Bangalore `560001`
- Mumbai `400001`
- New Delhi `110001`
- Ahmedabad `380001`
- Guwahati `781001`
- Kolkata `700001`
- Chennai `600001`
- Hyderabad `500001`
- Pune `411001`
- Jaipur `302001`
- Lucknow `226001`
- Chandigarh `160017`
- Bhopal `462001`
- Indore `452001`
- Patna `800001`
- Bhubaneswar `751001`
- Kochi `682001`
- Coimbatore `641001`
- Nagpur `440001`
- Surat `395003`
- Vadodara `390001`
- Visakhapatnam `530001`

## UX

- Search by `ucode` or product name.
- Type `all` to select every product.
- Select any number of cities, or all cities.
- Up to 10 selected SKUs render live across the selected cities.
- More than 10 selected SKUs switch to CSV mode.
- `Fetch Missing` fetches selected SKU-city rows that have not been fetched yet.
- `Complete Fetch` refreshes every selected SKU-city row and is capped at 10 SKUs by design.
- The overall slider sets the default delta-reduction scenario, and every product-city row has its own slider override.
- Product-city row sliders use the city-level PLD file for sales MRP, current PE PLD, and current PLD burn.
- The overall slider uses the overall-level PLD file for overall sales MRP, current PE PLD, and current PLD burn.
- AI Insight includes the selected aggregate view plus a card for each selected city.
- CSV export is saved through the local server under `exports/` and the dashboard shows an `Open CSV` link after generation.
- City and overall projected savings are shown both as rupee PLD burn savings and as PLD percentage-point savings.
- CSV export includes city and overall source bases, platform PLD %, city delta, overall delta, excess percentage-point logic, slider saving, PLD savings at the active slider, PLD savings if excess delta is reduced by 25%, 50%, 75%, or 100%, plus city, overall, and combined AI insight columns.

## Savings Logic

The dashboard now keeps two PharmEasy bases:

- City row base: `City Level PLD Everything.csv`, keyed by `ucode + delivery_city_name`.
- Overall base: `Overall Level PLD Everything.csv`, keyed by `ucode`.

For each platform:

```text
city_pharmeasy_pld_pct = city_pld_perc * 100
city_pld_burn = city_sales_abetted_mrp * city_pld_perc
overall_pharmeasy_pld_pct = overall_pld_perc * 100
overall_pld_burn = overall_sales_abetted_mrp * overall_pld_perc
city_delta_vs_pharmeasy_pp = platform_pld_pct - city_pharmeasy_pld_pct
overall_delta_vs_pharmeasy_pp = platform_pld_pct - overall_pharmeasy_pld_pct
row_opportunity_delta_pp = most negative platform delta in that product-city row
city_savings_at_x_pct = min(city_pld_burn, city_sales_mrp * abs(row_opportunity_delta_pp) / 100 * x_pct)
overall_savings_at_x_pct = min(overall_pld_burn, overall_sales_mrp * abs(product_overall_opportunity_delta_pp) / 100 * x_pct)
projected_city_pld_pct = (city_pld_burn - city_savings_at_slider) / city_sales_mrp * 100
projected_overall_pld_pct = (overall_pld_burn - overall_savings_at_slider) / overall_sales_mrp * 100
```

## Scraping

- Tata 1MG uses the live static and dynamic SKU APIs.
- Truemeds uses PDP `__NEXT_DATA__` plus pincode serviceability.
- PharmEasy uses the PLD % supplied in the mapping CSV as the benchmark and `sales_mrp` / `pld_burn` from the burn CSV as the current revenue base.

Requests are cached briefly in-process to keep repeated checks across the same products and pincodes quick while avoiding stale long-term data.

## Editable Inputs

Use `Import Catalog` to load updated CSVs later:

- Mapping CSV with `ucode`, product name, platform links, and PharmEasy PLD.
- Overall PLD CSV with `sales_abetted_mrp`, `pld_perc`, and blank `delivery_city_name`.
- City PLD CSV with `sales_abetted_mrp`, `pld_perc`, and populated `delivery_city_name`.

The app merges updated rows by product name or `ucode` depending on the sheet type.

For the large source files in this workspace, rebuild the compact dashboard catalog with:

```bash
python3 scripts/build_pld_catalog.py
```
