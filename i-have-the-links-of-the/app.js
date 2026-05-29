(function () {
  const STORAGE_KEY = "medicine-price-dashboard:v6";
  const SKU_LIMIT = 10;
  const LIVE_PLATFORMS = ["Tata 1MG", "Truemeds"];
  const DEFAULT_LOCATIONS = [
    { city: "Bangalore", pincode: "560001", metricCity: "Bengaluru" },
    { city: "Mumbai", pincode: "400001", metricCity: "Mumbai" },
    { city: "New Delhi", pincode: "110001", metricCity: "Delhi" },
    { city: "Ahmedabad", pincode: "380001", metricCity: "Ahmedabad" },
    { city: "Guwahati", pincode: "781001", metricCity: "Guwahati" },
    { city: "Kolkata", pincode: "700001", metricCity: "Kolkata" },
    { city: "Chennai", pincode: "600001", metricCity: "Chennai" },
    { city: "Hyderabad", pincode: "500001", metricCity: "Hyderabad" },
    { city: "Pune", pincode: "411001", metricCity: "Pune" },
    { city: "Jaipur", pincode: "302001", metricCity: "Jaipur" },
    { city: "Lucknow", pincode: "226001", metricCity: "Lucknow" },
    { city: "Chandigarh", pincode: "160017", metricCity: "Chandigarh" },
    { city: "Bhopal", pincode: "462001", metricCity: "Bhopal" },
    { city: "Indore", pincode: "452001", metricCity: "Indore" },
    { city: "Patna", pincode: "800001", metricCity: "Patna" },
    { city: "Bhubaneswar", pincode: "751001", metricCity: "Bhubaneswar" },
    { city: "Kochi", pincode: "682001", metricCity: "Cochin" },
    { city: "Coimbatore", pincode: "641001", metricCity: "Coimbatore" },
    { city: "Nagpur", pincode: "440001", metricCity: "Nagpur" },
    { city: "Surat", pincode: "395003", metricCity: "Surat" },
    { city: "Vadodara", pincode: "390001", metricCity: "Vadodara" },
    { city: "Visakhapatnam", pincode: "530001", metricCity: "Visakhapatnam" }
  ];
  const CITY_METRIC_ALIASES = {
    Bangalore: "Bengaluru",
    "New Delhi": "Delhi",
    Kochi: "Cochin"
  };

  const state = {
    query: "",
    reductionPct: 50,
    platforms: new Set(LIVE_PLATFORMS),
    selectedIds: new Set(),
    selectedLocationKeys: new Set(),
    rowReductions: new Map(),
    data: normalizeData(loadInitialData()),
    isFetching: false
  };

  const els = {
    cityList: document.querySelector("#cityList"),
    selectAllCities: document.querySelector("#selectAllCities"),
    clearCities: document.querySelector("#clearCities"),
    searchInput: document.querySelector("#searchInput"),
    suggestionList: document.querySelector("#suggestionList"),
    platformInputs: Array.from(document.querySelectorAll(".platform-toggle input")),
    liveFetchButton: document.querySelector("#liveFetchButton"),
    completeFetchButton: document.querySelector("#completeFetchButton"),
    liveStatus: document.querySelector("#liveStatus"),
    deltaSlider: document.querySelector("#deltaSlider"),
    sliderValue: document.querySelector("#sliderValue"),
    simulationNote: document.querySelector("#simulationNote"),
    productList: document.querySelector("#productList"),
    selectedProductsNote: document.querySelector("#selectedProductsNote"),
    selectAllProducts: document.querySelector("#selectAllProducts"),
    clearProducts: document.querySelector("#clearProducts"),
    kpiProducts: document.querySelector("#kpiProducts"),
    kpiProductsNote: document.querySelector("#kpiProductsNote"),
    kpiDiscount: document.querySelector("#kpiDiscount"),
    kpiDiscountNote: document.querySelector("#kpiDiscountNote"),
    kpiSaving: document.querySelector("#kpiSaving"),
    kpiSavingNote: document.querySelector("#kpiSavingNote"),
    kpiFreshness: document.querySelector("#kpiFreshness"),
    kpiFreshnessNote: document.querySelector("#kpiFreshnessNote"),
    insightBox: document.querySelector("#discountBars"),
    deltaBars: document.querySelector("#winnerList"),
    resultCount: document.querySelector("#resultCount"),
    priceHead: document.querySelector("#priceHead"),
    priceTable: document.querySelector("#priceTable"),
    importButton: document.querySelector("#importButton"),
    exportButton: document.querySelector("#exportButton"),
    resetButton: document.querySelector("#resetButton"),
    fileInput: document.querySelector("#fileInput")
  };

  init();

  function init() {
    getLocations().forEach((location, index) => {
      if (index === 0) state.selectedLocationKeys.add(locationKey(location));
    });
    bindEvents();
    renderAll();
    refreshServerCatalog();
  }

  function bindEvents() {
    els.cityList.addEventListener("change", (event) => {
      const input = event.target.closest("input[type='checkbox']");
      if (!input) return;
      if (input.checked) state.selectedLocationKeys.add(input.value);
      else state.selectedLocationKeys.delete(input.value);
      if (!state.selectedLocationKeys.size) state.selectedLocationKeys.add(locationKey(getLocations()[0]));
      renderAll();
    });

    els.selectAllCities.addEventListener("click", () => {
      getLocations().forEach((location) => state.selectedLocationKeys.add(locationKey(location)));
      renderAll();
    });

    els.clearCities.addEventListener("click", () => {
      state.selectedLocationKeys.clear();
      state.selectedLocationKeys.add(locationKey(getLocations()[0]));
      renderAll();
    });

    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value.trim();
      renderSuggestions();
    });

    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (isAllQuery(state.query)) {
        selectAllProducts();
        return;
      }
      const [first] = getSuggestions(state.query);
      if (first) addProduct(first.id);
    });

    els.suggestionList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-product-id], button[data-action]");
      if (!button) return;
      if (button.dataset.action === "all") selectAllProducts();
      else addProduct(button.dataset.productId);
    });

    els.productList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-remove-id]");
      if (!button) return;
      state.selectedIds.delete(button.dataset.removeId);
      clearRowOverridesForProduct(button.dataset.removeId);
      renderAll();
    });

    els.platformInputs.forEach((input) => {
      input.addEventListener("change", () => {
        state.platforms = new Set(
          els.platformInputs.filter((item) => item.checked).map((item) => normalizePlatform(item.value))
        );
        if (!state.platforms.size) state.platforms = new Set(LIVE_PLATFORMS);
        renderAll();
      });
    });

    els.deltaSlider.addEventListener("input", () => {
      state.reductionPct = Number(els.deltaSlider.value);
      state.rowReductions.clear();
      renderAll();
    });

    els.priceTable.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-row-reduction-key]");
      if (!input) return;
      state.rowReductions.set(input.dataset.rowReductionKey, Number(input.value));
      renderAll();
    });

    els.selectAllProducts.addEventListener("click", selectAllProducts);
    els.clearProducts.addEventListener("click", () => {
      state.selectedIds.clear();
      setLiveStatus("Selection cleared", "idle");
      renderAll();
    });
    els.liveFetchButton.addEventListener("click", () => {
      if (selectedProducts().length > SKU_LIMIT) exportComparisonCsv(getRows());
      else fetchComparisons(false);
    });
    els.completeFetchButton.addEventListener("click", () => fetchComparisons(true));
    els.exportButton.addEventListener("click", () => exportComparisonCsv(getRows()));
    els.importButton.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", handleImport);
    els.resetButton.addEventListener("click", () => {
      getStorage()?.removeItem(STORAGE_KEY);
      state.data = normalizeData(window.PRICE_DATA || {});
      state.selectedIds.clear();
      state.selectedLocationKeys.clear();
      state.rowReductions.clear();
      getLocations().forEach((location, index) => {
        if (index === 0) state.selectedLocationKeys.add(locationKey(location));
      });
      state.platforms = new Set(LIVE_PLATFORMS);
      state.reductionPct = 50;
      state.query = "";
      els.searchInput.value = "";
      setLiveStatus("Ready", "idle");
      renderAll();
      refreshServerCatalog();
    });
  }

  async function refreshServerCatalog() {
    try {
      const response = await fetch("/api/products", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      state.data = mergeData(state.data, normalizeData(payload));
      renderAll();
    } catch (error) {
      console.debug("Product catalog API unavailable", error);
    }
  }

  async function fetchComparisons(forceRefresh) {
    if (state.isFetching) return;
    const products = selectedProducts();
    const locations = selectedLocations();
    const platforms = activePlatforms();
    if (!products.length) {
      setLiveStatus("Search and add products first", "error");
      return;
    }
    if (products.length > SKU_LIMIT) {
      setLiveStatus(`Complete live fetch is capped at ${SKU_LIMIT} SKUs. Download CSV for larger selections.`, "error");
      return;
    }
    if (!locations.length) {
      setLiveStatus("Select at least one city", "error");
      return;
    }
    if (!platforms.length) {
      setLiveStatus("Select at least one live source", "error");
      return;
    }

    const payloadProducts = forceRefresh ? products : productsNeedingFetch(products, locations, platforms);
    const payloadLocations = forceRefresh ? locations : locationsNeedingFetch(payloadProducts, locations, platforms);
    if (!forceRefresh && (!payloadProducts.length || !payloadLocations.length)) {
      setLiveStatus("Everything selected is already fetched", "ok");
      return;
    }

    state.isFetching = true;
    els.liveFetchButton.disabled = true;
    els.completeFetchButton.disabled = true;
    const requestCount = (forceRefresh ? products.length * locations.length : payloadProducts.length * payloadLocations.length) * platforms.length;
    setLiveStatus(`${forceRefresh ? "Complete fetch" : "Fetching"} ${requestCount} live quote${requestCount === 1 ? "" : "s"}`, "busy");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          locations: payloadLocations,
          platforms,
          products: payloadProducts,
          forceRefresh
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
      state.data = mergeData(state.data, normalizeData(payload));
      saveData();
      renderAll();
      const fetched = (payload.snapshots || []).length;
      const errors = (payload.snapshots || []).filter((quote) => quote.error).length;
      setLiveStatus(`${fetched - errors} fetched, ${errors} errors`, errors ? "warn" : "ok");
    } catch (error) {
      setLiveStatus(`Fetch failed: ${error.message}`, "error");
    } finally {
      state.isFetching = false;
      els.liveFetchButton.disabled = false;
      els.completeFetchButton.disabled = false;
      updatePrimaryAction();
    }
  }

  function renderAll() {
    renderCities();
    renderPlatformControls();
    renderSuggestions();
    renderSelection();
    els.sliderValue.textContent = `${state.reductionPct}%`;
    const rows = getRows();
    const summary = summarizeRows(rows);
    renderKpis(rows, summary);
    renderInsight(rows, summary);
    renderDeltaBars(summary);
    renderTable(rows);
    updatePrimaryAction();
  }

  function renderCities() {
    const locations = getLocations();
    locations.forEach((location, index) => {
      if (!state.selectedLocationKeys.size && index === 0) state.selectedLocationKeys.add(locationKey(location));
    });
    els.cityList.innerHTML = locations
      .map((location) => {
        const key = locationKey(location);
        const metricCity = metricCityForLocation(location);
        const metricLabel = metricCity && metricCity !== location.city ? ` | PLD ${metricCity}` : "";
        return `
          <label class="city-choice">
            <input type="checkbox" value="${escapeAttribute(key)}"${state.selectedLocationKeys.has(key) ? " checked" : ""}>
            <span>${escapeHtml(location.city)}</span>
            <small>${escapeHtml(`${location.pincode}${metricLabel}`)}</small>
          </label>
        `;
      })
      .join("");
  }

  function renderPlatformControls() {
    els.platformInputs.forEach((input) => {
      input.checked = state.platforms.has(normalizePlatform(input.value));
    });
  }

  function renderSuggestions() {
    const query = state.query.trim();
    if (!query) {
      els.suggestionList.innerHTML = "";
      return;
    }
    if (isAllQuery(query)) {
      els.suggestionList.innerHTML = `
        <button class="suggestion-item all-suggestion" type="button" data-action="all">
          <strong>Select all ${state.data.products.length.toLocaleString("en-IN")} products</strong>
          <span>CSV mode. Live complete fetch remains capped at ${SKU_LIMIT} SKUs.</span>
        </button>
      `;
      return;
    }
    const suggestions = getSuggestions(query);
    els.suggestionList.innerHTML = suggestions.length
      ? suggestions.map(renderSuggestion).join("")
      : '<div class="suggestion-empty">No product found</div>';
  }

  function renderSuggestion(product) {
    const overall = getOverallMetric(product);
    return `
      <button class="suggestion-item" type="button" data-product-id="${escapeAttribute(product.id)}">
        <strong>${escapeHtml(product.ucode || product.id)} - ${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.category || "Product")} | overall PE PLD ${formatPercent(overall.discountPct)}% | sales ${formatCurrency(overall.salesMrp)}</span>
      </button>
    `;
  }

  function renderSelection() {
    const selected = selectedProducts();
    const bulkMode = selected.length > SKU_LIMIT;
    els.selectedProductsNote.textContent = selected.length
      ? `${selected.length.toLocaleString("en-IN")} selected | ${selectedLocations().length} cit${selectedLocations().length === 1 ? "y" : "ies"}${bulkMode ? " | CSV mode" : ""}`
      : `0 selected from ${state.data.products.length.toLocaleString("en-IN")} products`;

    if (!selected.length) {
      els.productList.innerHTML = '<div class="empty-products">Search by u_code or product name. Type all to select the full catalog.</div>';
      return;
    }
    const shown = bulkMode ? selected.slice(0, SKU_LIMIT) : selected;
    els.productList.innerHTML = `
      ${shown.map(renderSelectedProduct).join("")}
      ${
        selected.length > shown.length
          ? `<div class="bulk-note">${(selected.length - shown.length).toLocaleString("en-IN")} more selected. Live complete fetch is capped at ${SKU_LIMIT} SKUs; CSV export remains available.</div>`
          : ""
      }
    `;
  }

  function renderSelectedProduct(product) {
    const overall = getOverallMetric(product);
    const badges = [
      product.links?.["Tata 1MG"] ? "1MG" : "",
      product.links?.Truemeds ? "Truemeds" : "",
      isFiniteNumber(overall.discountPct) ? `PE ${formatPercent(overall.discountPct)}%` : "PE",
      isFiniteNumber(overall.salesMrp) ? formatShortCurrency(overall.salesMrp) : ""
    ]
      .filter(Boolean)
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("");
    return `
      <div class="product-choice selected-product">
        <span>
          <strong>${escapeHtml(product.ucode || product.id)} - ${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.category || "")}</small>
        </span>
        <span class="source-badges">${badges}</span>
        <button class="icon-button" type="button" data-remove-id="${escapeAttribute(product.id)}">Remove</button>
      </div>
    `;
  }

  function renderKpis(rows, summary) {
    els.kpiProducts.textContent = selectedProducts().length.toLocaleString("en-IN");
    els.kpiProductsNote.textContent = `${selectedLocations().length} cit${selectedLocations().length === 1 ? "y" : "ies"} | ${rows.length.toLocaleString("en-IN")} rows`;
    els.kpiDiscount.textContent = summary.bestPlatform
      ? `${summary.bestPlatform}: ${formatPercent(summary.avgDiscount[summary.bestPlatform])}%`
      : "-";
    els.kpiDiscountNote.textContent = "weighted aggregate PLD";
    els.kpiSaving.textContent = `T ${formatSigned(summary.avgDelta["Tata 1MG"])} | TM ${formatSigned(summary.avgDelta.Truemeds)}`;
    els.kpiSavingNote.textContent = "city delta vs PE, pp";
    els.kpiFreshness.textContent = formatCurrency(summary.overall.sliderSavings);
    els.kpiFreshnessNote.textContent = `overall PLD save ${formatPercent(summary.overall.pldSavingPct)} pp | city ${formatCurrency(summary.sliderSavings)}`;
    els.simulationNote.textContent = `City PLD: ${formatPercent(summary.currentPldPct)}% to ${formatPercent(summary.projectedPldPct)}% (save ${formatPercent(summary.pldSavingPct)} pp). Overall PE PLD: ${formatPercent(summary.overall.currentPldPct)}% to ${formatPercent(summary.overall.projectedPldPct)}% (save ${formatPercent(summary.overall.pldSavingPct)} pp) at ${state.reductionPct}% reduction.`;
  }

  function renderInsight(rows, summary) {
    if (!rows.length) {
      els.insightBox.innerHTML = "<p>Select SKUs and cities to see weighted PLD deltas and savings.</p>";
      return;
    }
    if (!summary.fetchedRows) {
      els.insightBox.innerHTML = `<p>${rows.length.toLocaleString("en-IN")} product-city rows selected. Run Fetch & Compare, or Complete Fetch to refresh every selected city.</p>`;
      return;
    }
    const tataDelta = summary.avgDelta["Tata 1MG"];
    const trueDelta = summary.avgDelta.Truemeds;
    const opportunity = summary.sliderSavings;
    const overall = summary.overall;
    const cityCards = renderCityInsightCards(rows);
    els.insightBox.innerHTML = `
      <p><strong>${escapeHtml(summary.bestPlatform || "Live source")} has the highest weighted PLD among fetched rows.</strong></p>
      <p>Tata 1MG delta: ${formatSigned(tataDelta)} pp; Truemeds delta: ${formatSigned(trueDelta)} pp versus PharmEasy.</p>
      <p>City-level projected saving is ${formatCurrency(opportunity)} and ${formatPercent(summary.pldSavingPct)} pp PLD, moving PharmEasy PLD from ${formatPercent(summary.currentPldPct)}% to ${formatPercent(summary.projectedPldPct)}%.</p>
      <p>Overall-level projected saving is ${formatCurrency(overall.sliderSavings)} and ${formatPercent(overall.pldSavingPct)} pp PLD, moving overall PharmEasy PLD from ${formatPercent(overall.currentPldPct)}% to ${formatPercent(overall.projectedPldPct)}%.</p>
      ${cityCards}
    `;
  }

  function renderCityInsightCards(rows) {
    const citySummaries = summarizeCities(rows).filter((city) => city.fetchedRows);
    if (!citySummaries.length) return "";
    return `
      <div class="city-insight-grid">
        ${citySummaries.map(renderCityInsightCard).join("")}
      </div>
    `;
  }

  function renderCityInsightCard(city) {
    const tataDelta = city.avgDelta["Tata 1MG"];
    const truemedsDelta = city.avgDelta.Truemeds;
    const opportunityText = city.topOpportunity
      ? `${city.topOpportunity.product.name} uses ${city.topOpportunity.opportunity.platform} at ${formatSigned(city.topOpportunity.opportunity.delta)} pp.`
      : "No negative PLD gap in fetched rows.";
    return `
      <article class="city-insight-card">
        <strong>${escapeHtml(city.city)}</strong>
        <span>${city.rowCount.toLocaleString("en-IN")} row${city.rowCount === 1 ? "" : "s"} | saving ${formatCurrency(city.sliderSavings)}</span>
        <span>Projected PLD saving ${formatPercent(city.pldSavingPct)} pp</span>
        <span>PE PLD ${formatPercent(city.currentPldPct)}% to ${formatPercent(city.projectedPldPct)}%</span>
        <span>Tata ${formatSigned(tataDelta)} pp | Truemeds ${formatSigned(truemedsDelta)} pp</span>
        <small>${escapeHtml(opportunityText)}</small>
      </article>
    `;
  }

  function renderDeltaBars(summary) {
    const max = Math.max(1, ...LIVE_PLATFORMS.map((platform) => Math.abs(summary.avgDelta[platform] || 0)));
    els.deltaBars.innerHTML = LIVE_PLATFORMS.map((platform) => {
      const delta = summary.avgDelta[platform];
      const width = isFiniteNumber(delta) ? Math.max(5, (Math.abs(delta) / max) * 100) : 0;
      const tone = !isFiniteNumber(delta) ? "neutral" : delta >= 0 ? "positive" : "negative";
      return `
        <div class="winner-row">
          <span class="winner-label">${escapeHtml(platform)}</span>
          <div class="bar-track" aria-hidden="true"><div class="bar-fill ${tone}" style="width:${width}%"></div></div>
          <span class="winner-value">${isFiniteNumber(delta) ? `${formatSigned(delta)} pp` : "-"}</span>
        </div>
      `;
    }).join("");
  }

  function renderTable(rows) {
    const bulkMode = selectedProducts().length > SKU_LIMIT;
    els.priceHead.innerHTML = `
      <th>City</th>
      <th>UCode</th>
      <th>Product</th>
      <th>PE Base</th>
      <th>Tata 1MG</th>
      <th>Truemeds</th>
      <th>Projected Saving</th>
      <th>AI Insight</th>
    `;
    els.resultCount.textContent = bulkMode
      ? `${rows.length.toLocaleString("en-IN")} selected rows | CSV mode`
      : `${rows.length.toLocaleString("en-IN")} comparison ${rows.length === 1 ? "row" : "rows"}`;

    if (!rows.length) {
      els.priceTable.innerHTML = `
        <tr><td colspan="8"><div class="empty-state"><strong>No products selected</strong><span>Search by u_code or product name, or type all.</span></div></td></tr>
      `;
      return;
    }
    if (bulkMode) {
      els.priceTable.innerHTML = `
        <tr><td colspan="8"><div class="empty-state"><strong>CSV mode is active</strong><span>${selectedProducts().length.toLocaleString("en-IN")} SKUs selected. Download CSV exports every selected product-city row, city insights, overall insights, and savings scenarios.</span></div></td></tr>
      `;
      return;
    }
    els.priceTable.innerHTML = rows.map(renderComparisonRow).join("");
  }

  function renderComparisonRow(row) {
    return `
      <tr>
        <td><span class="ucode">${escapeHtml(row.location.city)}</span><span class="price-meta">${escapeHtml(row.location.pincode)}</span></td>
        <td><span class="ucode">${escapeHtml(row.product.ucode || row.product.id)}</span></td>
        <td>
          <span class="product-name">${escapeHtml(row.product.name)}</span>
          <span class="product-meta">${escapeHtml(row.product.category || "")}</span>
        </td>
        <td>
          <span class="benchmark-pill">${formatPercent(row.pePld)}%</span>
          <span class="price-meta">City sales ${formatCurrency(row.allocatedSalesMrp)}</span>
          <span class="price-meta">City burn ${formatCurrency(row.allocatedBurn)}</span>
          <span class="price-meta">${escapeHtml(row.metricLabel)}</span>
          <span class="price-meta">Projected city PLD ${formatPercent(row.projectedPldPct)}%</span>
          <span class="price-meta">Projected PLD saving ${formatPercent(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp))} pp</span>
        </td>
        ${LIVE_PLATFORMS.map((platform) => renderPlatformCell(row, platform)).join("")}
        ${renderOpportunityCell(row)}
        <td class="insight-cell">${escapeHtml(rowInsight(row))}</td>
      </tr>
    `;
  }

  function renderPlatformCell(row, platform) {
    const item = row.platforms[platform];
    const quote = item.quote;
    const url = quote?.url || row.product.links?.[platform] || "";
    if (!quote) {
      return `<td class="price-cell"><span class="missing">Not fetched</span>${renderSourceLink(url)}</td>`;
    }
    if (quote.error || !isFiniteNumber(item.discount)) {
      return `<td class="price-cell"><span class="missing">${escapeHtml(quote.error || quote.stock || "No live price")}</span>${renderSourceLink(url)}</td>`;
    }
    return `
      <td class="price-cell">
        <div class="price-main">
          <span>${formatCurrency(quote.price)}</span>
          <span class="discount-pill">${formatPercent(item.discount)}%</span>
        </div>
        <span class="price-meta">MRP ${formatCurrency(quote.mrp)} | city delta ${formatDelta(item.delta)}</span>
        <span class="price-meta">Overall delta ${formatDelta(item.overallDelta)}</span>
        <span class="price-meta">Save @ slider ${formatCurrency(item.sliderSavings)}</span>
        <span class="status-pill ${getStatusClass(quote.stock)}">${escapeHtml(quote.stock || "Unknown")}</span>
        <span class="price-meta">${renderSourceLink(url)}</span>
      </td>
    `;
  }

  function renderOpportunityCell(row) {
    const rowSlider = renderRowSlider(row);
    const hasFetchedDiscount = LIVE_PLATFORMS.some((platform) => isFiniteNumber(row.platforms[platform].discount));
    if (!row.opportunity.platform) {
      const label = hasFetchedDiscount ? "No excess" : "Awaiting fetch";
      const detail = hasFetchedDiscount
        ? "No negative PLD gap vs PharmEasy in fetched platforms."
        : "Fetch live prices to calculate the worst PLD gap.";
      return `
        <td class="price-cell">
          <span class="benchmark-pill">${label}</span>
          <span class="price-meta">${detail}</span>
          ${rowSlider}
          <span class="price-meta">City PE PLD after reduction ${formatPercent(row.projectedPldPct)}%</span>
          <span class="price-meta">Projected PLD saving ${formatPercent(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp))} pp</span>
          <span class="price-meta">Slider saving ${formatCurrency(row.opportunity.sliderSavings)}</span>
        </td>
      `;
    }
    return `
      <td class="price-cell">
        <span class="benchmark-pill">${escapeHtml(row.opportunity.platform)}</span>
        <span class="price-meta">Worst gap ${formatSigned(row.opportunity.delta)} pp</span>
        ${rowSlider}
        <span class="price-meta">City PE PLD after reduction ${formatPercent(row.projectedPldPct)}%</span>
        <span class="price-meta">Projected PLD saving ${formatPercent(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp))} pp</span>
        <span class="price-meta">Slider saving ${formatCurrency(row.opportunity.sliderSavings)}</span>
        <span class="price-meta">100% saving ${formatCurrency(row.opportunity.savings100)}</span>
      </td>
    `;
  }

  function renderRowSlider(row) {
    return `
      <label class="row-slider">
        <span>Reduce ${formatPercent(row.rowReductionPct)}%</span>
        <input type="range" min="0" max="100" step="5" value="${escapeAttribute(row.rowReductionPct)}" data-row-reduction-key="${escapeAttribute(row.key)}">
      </label>
    `;
  }

  function renderSourceLink(url) {
    return url
      ? `<a class="pdp-link" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">PDP</a>`
      : '<span class="missing">No link</span>';
  }

  function updatePrimaryAction() {
    const selectedCount = selectedProducts().length;
    els.liveFetchButton.textContent = selectedCount > SKU_LIMIT ? "Download CSV" : "Fetch Missing";
    els.completeFetchButton.disabled = state.isFetching || selectedCount > SKU_LIMIT;
  }

  function getRows() {
    const quotesByKey = quoteMap();
    const products = selectedProducts();
    const locations = selectedLocations();
    const locationCount = Math.max(1, locations.length);
    const rows = products.flatMap((product) =>
      locations.map((location) => {
        const key = rowKeyFromParts(product.id, location);
        const rowReductionPct = state.rowReductions.has(key) ? state.rowReductions.get(key) : state.reductionPct;
        const cityMetric = getCityMetric(product, location, locationCount);
        const overallMetric = getOverallMetric(product);
        const pe = cityMetric.discountPct;
        const overallPe = overallMetric.discountPct;
        const allocatedSalesMrp = numericOrZero(cityMetric.salesMrp);
        const allocatedBurn = numericOrZero(cityMetric.pldBurn);
        const platforms = LIVE_PLATFORMS.reduce((acc, platform) => {
          const quote = quotesByKey.get(snapshotKey(product.id, platform, location));
          const discount = quote ? getDiscount(product, quote) : null;
          const delta = isFiniteNumber(discount) && isFiniteNumber(pe) ? Number(discount) - Number(pe) : null;
          const excess = isFiniteNumber(discount) && isFiniteNumber(pe) ? Math.max(0, Number(pe) - Number(discount)) : 0;
          const overallDelta = isFiniteNumber(discount) && isFiniteNumber(overallPe) ? Number(discount) - Number(overallPe) : null;
          const overallExcess = isFiniteNumber(discount) && isFiniteNumber(overallPe) ? Math.max(0, Number(overallPe) - Number(discount)) : 0;
          acc[platform] = {
            platform,
            quote,
            discount,
            delta,
            excess,
            overallDelta,
            overallExcess,
            sliderSavings: cappedSavings(allocatedBurn, allocatedSalesMrp, excess, rowReductionPct),
            savings25: cappedSavings(allocatedBurn, allocatedSalesMrp, excess, 25),
            savings50: cappedSavings(allocatedBurn, allocatedSalesMrp, excess, 50),
            savings75: cappedSavings(allocatedBurn, allocatedSalesMrp, excess, 75),
            savings100: cappedSavings(allocatedBurn, allocatedSalesMrp, excess, 100)
          };
          return acc;
        }, {});
        const fetchedPlatforms = LIVE_PLATFORMS.filter((platform) => isFiniteNumber(platforms[platform].discount));
        const bestPlatform = fetchedPlatforms.slice().sort((a, b) => platforms[b].discount - platforms[a].discount)[0] || "";
        const opportunityPlatform = fetchedPlatforms
          .filter((platform) => isFiniteNumber(platforms[platform].delta) && platforms[platform].delta < 0)
          .sort((a, b) => platforms[a].delta - platforms[b].delta)[0] || "";
        const opportunityExcess = opportunityPlatform ? Math.abs(platforms[opportunityPlatform].delta) : 0;
        const opportunity = {
          platform: opportunityPlatform,
          delta: opportunityPlatform ? platforms[opportunityPlatform].delta : null,
          excess: opportunityExcess,
          sliderSavings: cappedSavings(allocatedBurn, allocatedSalesMrp, opportunityExcess, rowReductionPct),
          savings25: cappedSavings(allocatedBurn, allocatedSalesMrp, opportunityExcess, 25),
          savings50: cappedSavings(allocatedBurn, allocatedSalesMrp, opportunityExcess, 50),
          savings75: cappedSavings(allocatedBurn, allocatedSalesMrp, opportunityExcess, 75),
          savings100: cappedSavings(allocatedBurn, allocatedSalesMrp, opportunityExcess, 100)
        };
        const projectedBurn = Math.max(0, allocatedBurn - opportunity.sliderSavings);
        const projectedPldPct = allocatedSalesMrp ? (projectedBurn / allocatedSalesMrp) * 100 : null;
        return {
          key,
          product,
          location,
          pePld: pe,
          rowReductionPct,
          allocatedSalesMrp,
          allocatedBurn,
          metricCity: cityMetric.city,
          metricSource: cityMetric.source,
          metricLabel: cityMetric.source === "city"
            ? `Source ${cityMetric.city} city PLD`
            : `Source ${cityMetric.sourceLabel || "overall fallback"}`,
          overallMetric,
          projectedPldPct,
          projectedBurn,
          platforms,
          bestPlatform,
          opportunity
        };
      })
    );
    const overallScenarios = buildOverallScenarios(rows);
    rows.forEach((row) => {
      row.overallScenario = overallScenarios.get(row.product.id) || emptyOverallScenario(row.product);
    });
    return rows;
  }

  function summarizeRows(rows) {
    const overallScenarios = uniqueOverallScenarios(rows);
    const summary = {
      avgDiscount: {},
      avgDelta: {},
      currentBurn: sum(rows.map((row) => row.allocatedBurn)),
      salesMrp: sum(rows.map((row) => row.allocatedSalesMrp)),
      sliderSavings: 0,
      projectedBurn: 0,
      currentPldPct: null,
      projectedPldPct: null,
      fetchedRows: rows.filter((row) => LIVE_PLATFORMS.some((platform) => row.platforms[platform].quote)).length,
      bestPlatform: "",
      overall: {
        salesMrp: sum(overallScenarios.map((scenario) => scenario.salesMrp)),
        currentBurn: sum(overallScenarios.map((scenario) => scenario.currentBurn)),
        sliderSavings: sum(overallScenarios.map((scenario) => scenario.sliderSavings)),
        projectedBurn: sum(overallScenarios.map((scenario) => scenario.projectedBurn)),
        currentPldPct: null,
        projectedPldPct: null,
        fetchedProducts: overallScenarios.filter((scenario) => scenario.hasFetchedDiscount).length,
        opportunityProducts: overallScenarios.filter((scenario) => scenario.platform).length
      }
    };
    LIVE_PLATFORMS.forEach((platform) => {
      const weightedDiscount = weightedAverage(rows, (row) => row.platforms[platform].discount, (row) => row.allocatedSalesMrp);
      const weightedDelta = weightedAverage(rows, (row) => row.platforms[platform].delta, (row) => row.allocatedSalesMrp);
      summary.avgDiscount[platform] = weightedDiscount;
      summary.avgDelta[platform] = weightedDelta;
    });
    summary.bestPlatform = LIVE_PLATFORMS.filter((platform) => isFiniteNumber(summary.avgDiscount[platform]))
      .sort((a, b) => summary.avgDiscount[b] - summary.avgDiscount[a])[0] || "";
    summary.sliderSavings = sum(rows.map((row) => row.opportunity.sliderSavings));
    summary.projectedBurn = sum(rows.map((row) => row.projectedBurn));
    summary.currentPldPct = summary.salesMrp ? (summary.currentBurn / summary.salesMrp) * 100 : null;
    summary.projectedPldPct = summary.salesMrp ? (summary.projectedBurn / summary.salesMrp) * 100 : null;
    summary.pldSavingPct = pldSavingPctFromAmount(summary.sliderSavings, summary.salesMrp);
    summary.overall.currentPldPct = summary.overall.salesMrp ? (summary.overall.currentBurn / summary.overall.salesMrp) * 100 : null;
    summary.overall.projectedPldPct = summary.overall.salesMrp ? (summary.overall.projectedBurn / summary.overall.salesMrp) * 100 : null;
    summary.overall.pldSavingPct = pldSavingPctFromAmount(summary.overall.sliderSavings, summary.overall.salesMrp);
    return summary;
  }

  function buildOverallScenarios(rows) {
    const rowsByProduct = new Map();
    rows.forEach((row) => {
      if (!rowsByProduct.has(row.product.id)) rowsByProduct.set(row.product.id, []);
      rowsByProduct.get(row.product.id).push(row);
    });
    const scenarios = new Map();
    rowsByProduct.forEach((productRows, productId) => {
      scenarios.set(productId, overallScenarioFromRows(productRows));
    });
    return scenarios;
  }

  function overallScenarioFromRows(productRows) {
    const [firstRow] = productRows;
    if (!firstRow) return emptyOverallScenario({});
    const metric = getOverallMetric(firstRow.product);
    const candidates = [];
    productRows.forEach((row) => {
      LIVE_PLATFORMS.forEach((platform) => {
        const item = row.platforms[platform];
        if (!isFiniteNumber(item.discount) || !isFiniteNumber(item.overallDelta)) return;
        candidates.push({
          platform,
          city: row.location.city,
          discount: item.discount,
          delta: item.overallDelta,
          excess: item.overallExcess
        });
      });
    });
    const best = candidates.slice().sort((a, b) => b.discount - a.discount)[0] || null;
    const opportunity = candidates.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta)[0] || null;
    const excess = opportunity ? Math.abs(opportunity.delta) : 0;
    const salesMrp = numericOrZero(metric.salesMrp);
    const currentBurn = numericOrZero(metric.pldBurn);
    const sliderSavings = cappedSavings(currentBurn, salesMrp, excess, state.reductionPct);
    const projectedBurn = Math.max(0, currentBurn - sliderSavings);
    return {
      productId: firstRow.product.id,
      platform: opportunity?.platform || "",
      city: opportunity?.city || "",
      delta: opportunity?.delta ?? null,
      excess,
      bestPlatform: best?.platform || "",
      bestCity: best?.city || "",
      bestDiscount: best?.discount ?? null,
      hasFetchedDiscount: Boolean(candidates.length),
      salesMrp,
      currentBurn,
      currentPldPct: metric.discountPct,
      reductionPct: state.reductionPct,
      sliderSavings,
      pldSavingPct: pldSavingPctFromAmount(sliderSavings, salesMrp),
      savings25: cappedSavings(currentBurn, salesMrp, excess, 25),
      savings50: cappedSavings(currentBurn, salesMrp, excess, 50),
      savings75: cappedSavings(currentBurn, salesMrp, excess, 75),
      savings100: cappedSavings(currentBurn, salesMrp, excess, 100),
      pldSaving25: pldSavingPctFromAmount(cappedSavings(currentBurn, salesMrp, excess, 25), salesMrp),
      pldSaving50: pldSavingPctFromAmount(cappedSavings(currentBurn, salesMrp, excess, 50), salesMrp),
      pldSaving75: pldSavingPctFromAmount(cappedSavings(currentBurn, salesMrp, excess, 75), salesMrp),
      pldSaving100: pldSavingPctFromAmount(cappedSavings(currentBurn, salesMrp, excess, 100), salesMrp),
      projectedBurn,
      projectedPldPct: salesMrp ? (projectedBurn / salesMrp) * 100 : null
    };
  }

  function emptyOverallScenario(product) {
    const metric = getOverallMetric(product);
    const salesMrp = numericOrZero(metric.salesMrp);
    const currentBurn = numericOrZero(metric.pldBurn);
    return {
      productId: product?.id || "",
      platform: "",
      city: "",
      delta: null,
      excess: 0,
      bestPlatform: "",
      bestCity: "",
      bestDiscount: null,
      hasFetchedDiscount: false,
      salesMrp,
      currentBurn,
      currentPldPct: metric.discountPct,
      reductionPct: state.reductionPct,
      sliderSavings: 0,
      pldSavingPct: 0,
      savings25: 0,
      savings50: 0,
      savings75: 0,
      savings100: 0,
      pldSaving25: 0,
      pldSaving50: 0,
      pldSaving75: 0,
      pldSaving100: 0,
      projectedBurn: currentBurn,
      projectedPldPct: salesMrp ? (currentBurn / salesMrp) * 100 : null
    };
  }

  function uniqueOverallScenarios(rows) {
    const scenarios = new Map();
    rows.forEach((row) => {
      if (row.overallScenario) scenarios.set(row.product.id, row.overallScenario);
    });
    return Array.from(scenarios.values());
  }

  function summarizeCities(rows) {
    const byCity = new Map();
    rows.forEach((row) => {
      const key = locationKey(row.location);
      if (!byCity.has(key)) byCity.set(key, []);
      byCity.get(key).push(row);
    });
    return Array.from(byCity.values()).map((cityRows) => {
      const [first] = cityRows;
      const summary = {
        city: first?.location.city || "",
        rowCount: cityRows.length,
        currentBurn: sum(cityRows.map((row) => row.allocatedBurn)),
        salesMrp: sum(cityRows.map((row) => row.allocatedSalesMrp)),
        sliderSavings: sum(cityRows.map((row) => row.opportunity.sliderSavings)),
        projectedBurn: sum(cityRows.map((row) => row.projectedBurn)),
        currentPldPct: null,
        projectedPldPct: null,
        fetchedRows: cityRows.filter((row) => LIVE_PLATFORMS.some((platform) => row.platforms[platform].quote)).length,
        avgDelta: {},
        topOpportunity: null
      };
      LIVE_PLATFORMS.forEach((platform) => {
        summary.avgDelta[platform] = weightedAverage(cityRows, (row) => row.platforms[platform].delta, (row) => row.allocatedSalesMrp);
      });
      summary.currentPldPct = summary.salesMrp ? (summary.currentBurn / summary.salesMrp) * 100 : null;
      summary.projectedPldPct = summary.salesMrp ? (summary.projectedBurn / summary.salesMrp) * 100 : null;
      summary.pldSavingPct = pldSavingPctFromAmount(summary.sliderSavings, summary.salesMrp);
      summary.topOpportunity = cityRows
        .filter((row) => row.opportunity.platform)
        .sort((a, b) => b.opportunity.sliderSavings - a.opportunity.sliderSavings || a.opportunity.delta - b.opportunity.delta)[0] || null;
      return summary;
    });
  }

  function rowInsight(row) {
    const fetched = LIVE_PLATFORMS.filter((platform) => isFiniteNumber(row.platforms[platform].discount));
    if (!fetched.length) return "Fetch live prices to calculate city-level deltas.";
    const best = row.bestPlatform;
    const bestDelta = row.platforms[best].delta;
    const overallText = row.overallScenario?.platform
      ? ` Overall opportunity uses ${row.overallScenario.platform} in ${row.overallScenario.city} at ${formatSigned(row.overallScenario.delta)} pp.`
      : "";
    if (!row.opportunity.platform) {
      return `${best} has the higher PLD (${formatSigned(bestDelta)} pp vs city PE). No negative live gap to reduce.${overallText}`;
    }
    return `${best} has the higher PLD (${formatSigned(bestDelta)} pp vs city PE). City savings use ${row.opportunity.platform}, the worst negative gap at ${formatSigned(row.opportunity.delta)} pp, saving ${formatPercent(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp))} pp PLD.${overallText}`;
  }

  function cityCsvInsight(row) {
    const fetched = LIVE_PLATFORMS.filter((platform) => isFiniteNumber(row.platforms[platform].discount));
    if (!fetched.length) return `${row.location.city}: fetch live prices to calculate city deltas.`;
    const saving = formatCurrency(row.opportunity.sliderSavings);
    const pldSaving = formatPercent(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp));
    const pldMove = `${formatPercent(row.pePld)}% to ${formatPercent(row.projectedPldPct)}%`;
    if (!row.opportunity.platform) {
      return `${row.location.city}: no negative city PLD gap; city PE PLD remains ${pldMove}.`;
    }
    return `${row.location.city}: ${row.opportunity.platform} has the worst negative city gap at ${formatSigned(row.opportunity.delta)} pp; city saving ${saving} and ${pldSaving} pp PLD; city PE PLD moves ${pldMove}.`;
  }

  function overallCsvInsight(row) {
    const scenario = row.overallScenario || emptyOverallScenario(row.product);
    const pldMove = `${formatPercent(scenario.currentPldPct)}% to ${formatPercent(scenario.projectedPldPct)}%`;
    if (!scenario.hasFetchedDiscount) return `${row.product.ucode || row.product.id}: fetch live prices to calculate overall deltas.`;
    if (!scenario.platform) return `${row.product.ucode || row.product.id}: no negative overall PLD gap; overall PE PLD remains ${pldMove}.`;
    return `${row.product.ucode || row.product.id}: overall opportunity uses ${scenario.platform} in ${scenario.city} at ${formatSigned(scenario.delta)} pp; overall saving ${formatCurrency(scenario.sliderSavings)} and ${formatPercent(scenario.pldSavingPct)} pp PLD; overall PE PLD moves ${pldMove}.`;
  }

  function productsNeedingFetch(products, locations, platforms) {
    const quotes = quoteMap();
    return products.filter((product) =>
      locations.some((location) =>
        platforms.some((platform) => !quotes.has(snapshotKey(product.id, platform, location)))
      )
    );
  }

  function locationsNeedingFetch(products, locations, platforms) {
    const quotes = quoteMap();
    return locations.filter((location) =>
      products.some((product) =>
        platforms.some((platform) => !quotes.has(snapshotKey(product.id, platform, location)))
      )
    );
  }

  function quoteMap() {
    const map = new Map();
    state.data.snapshots.forEach((quote) => {
      map.set([quote.productId, quote.platform, quote.city, quote.pincode].join("|"), quote);
    });
    return map;
  }

  function snapshotKey(productId, platform, location) {
    return [productId, platform, location.city, location.pincode].join("|");
  }

  function rowKeyFromParts(productId, location) {
    return [productId, location.city, location.pincode].join("|");
  }

  function getDiscount(product, quote) {
    if (isFiniteNumber(quote?.discountPct)) return Number(quote.discountPct);
    const mrp = Number(quote?.mrp || product?.mrp || 0);
    const price = Number(quote?.price);
    if (!mrp || !isFiniteNumber(price)) return null;
    return Math.max(0, ((mrp - price) / mrp) * 100);
  }

  function pePld(product) {
    return getOverallMetric(product).discountPct;
  }

  function getOverallMetric(product) {
    const overall = normalizePldMetric(product?.overallPld || {});
    const salesMrp = numericOrNull(overall?.salesMrp ?? product?.salesMrp ?? product?.pharmeasyPld?.salesMrp);
    const pldBurn = numericOrNull(overall?.pldBurn ?? product?.pldBurn ?? product?.pharmeasyPld?.pldBurn);
    const discountPct = normalizePldPct(
      overall?.discountPct ?? product?.pharmeasyPld?.discountPct ?? product?.currentPldPct ?? product?.pld
    );
    return {
      ...(overall || {}),
      salesMrp,
      pldBurn: pldBurn ?? (isFiniteNumber(salesMrp) && isFiniteNumber(discountPct) ? Number(salesMrp) * Number(discountPct) / 100 : null),
      discountPct,
      source: overall?.source || product?.pharmeasyPld?.source || "overall"
    };
  }

  function getCityMetric(product, location, locationCount) {
    const metricCity = metricCityForLocation(location);
    const direct = product?.cityPld?.[metricCity] || product?.cityPld?.[location.city];
    const cityMetric = normalizePldMetric(direct || {});
    if (cityMetric && isFiniteNumber(cityMetric.salesMrp) && isFiniteNumber(cityMetric.discountPct)) {
      return {
        ...cityMetric,
        city: cityMetric.city || metricCity,
        pldBurn: cityMetric.pldBurn ?? Number(cityMetric.salesMrp) * Number(cityMetric.discountPct) / 100,
        source: "city",
        sourceLabel: cityMetric.source || "city PLD"
      };
    }

    const overall = getOverallMetric(product);
    const divisor = Math.max(1, locationCount || 1);
    const salesMrp = numericOrZero(overall.salesMrp) / divisor;
    const pldBurn = numericOrZero(overall.pldBurn) / divisor;
    return {
      city: metricCity,
      salesMrp,
      pldBurn,
      discountPct: overall.discountPct,
      source: "overall-fallback",
      sourceLabel: "overall PLD fallback"
    };
  }

  function metricCityForLocation(location) {
    return String(location?.metricCity || CITY_METRIC_ALIASES[location?.city] || location?.city || "");
  }

  function getSuggestions(query) {
    const needle = query.trim().toLowerCase();
    if (!needle || isAllQuery(needle)) return [];
    return state.data.products
      .map((product) => ({ product, score: scoreProduct(product, needle) }))
      .filter((item) => item.score < 100)
      .sort((a, b) => a.score - b.score || numericOrZero(getOverallMetric(b.product).salesMrp) - numericOrZero(getOverallMetric(a.product).salesMrp))
      .slice(0, 12)
      .map((item) => item.product);
  }

  function scoreProduct(product, query) {
    const ucode = String(product.ucode || product.id || "").toLowerCase();
    const name = String(product.name || "").toLowerCase();
    if (ucode === query) return 0;
    if (ucode.startsWith(query)) return 1;
    if (name.startsWith(query)) return 2;
    if (ucode.includes(query)) return 3;
    if (name.includes(query)) return 4;
    return 100;
  }

  function addProduct(productId) {
    if (!productId) return;
    state.selectedIds.add(productId);
    state.query = "";
    els.searchInput.value = "";
    setLiveStatus(`${state.selectedIds.size.toLocaleString("en-IN")} selected`, "idle");
    renderAll();
  }

  function selectAllProducts() {
    state.data.products.forEach((product) => state.selectedIds.add(product.id));
    state.query = "";
    els.searchInput.value = "";
    setLiveStatus(`${state.selectedIds.size.toLocaleString("en-IN")} selected for CSV mode`, "idle");
    renderAll();
  }

  function clearRowOverridesForProduct(productId) {
    Array.from(state.rowReductions.keys()).forEach((key) => {
      if (key.startsWith(`${productId}|`)) state.rowReductions.delete(key);
    });
  }

  function selectedProducts() {
    const productMap = new Map(state.data.products.map((product) => [product.id, product]));
    return Array.from(state.selectedIds).map((id) => productMap.get(id)).filter(Boolean);
  }

  function selectedLocations() {
    const byKey = new Map(getLocations().map((location) => [locationKey(location), location]));
    return Array.from(state.selectedLocationKeys).map((key) => byKey.get(key)).filter(Boolean);
  }

  function activePlatforms() {
    return LIVE_PLATFORMS.filter((platform) => state.platforms.has(platform));
  }

  function normalizeData(data) {
    const products = (Array.isArray(data.products) ? data.products : []).map(normalizeProduct).filter((item) => item.id);
    const snapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).map(normalizeQuote).filter(Boolean);
    const locations = uniqueLocations([...(Array.isArray(data.locations) ? data.locations : []), ...DEFAULT_LOCATIONS]);
    return {
      generatedAt: data.generatedAt || new Date().toISOString(),
      sourceFiles: data.sourceFiles || {},
      products,
      locations,
      snapshots
    };
  }

  function normalizeProduct(product) {
    const ucode = String(product.ucode || product.u_code || product.product_id || product.id || "").trim();
    const id = String(product.id || ucode || slugify(product.name || product.product_name || "")).trim();
    const pharmeasyPld = product.pharmeasyPld || product.pharmEasyPld || product.pld || {};
    return {
      id,
      ucode: ucode || id,
      name: String(product.name || product.productName || product.product_name || id),
      pack: String(product.pack || ""),
      salt: String(product.salt || ""),
      category: String(product.category || product.product_type || ""),
      mrp: numericOrNull(product.mrp),
      salesMrp: numericOrNull(product.salesMrp ?? product.sales_mrp ?? product.pharmeasyPld?.salesMrp),
      pldBurn: numericOrNull(product.pldBurn ?? product.pld_burn ?? product.pharmeasyPld?.pldBurn),
      currentPldPct: numericOrNull(product.currentPldPct ?? product.current_pld_pct),
      links: normalizeLinks(product.links || product.urls || {}),
      pharmeasyPld: typeof pharmeasyPld === "object" ? { ...pharmeasyPld } : { discountPct: numericOrNull(pharmeasyPld) },
      overallPld: normalizePldMetric(product.overallPld || product.overall_pld),
      cityPld: normalizeCityPld(product.cityPld || product.city_pld || {})
    };
  }

  function normalizePldMetric(metric) {
    if (!metric || typeof metric !== "object") return null;
    return {
      ...metric,
      city: metric.city ? String(metric.city) : "",
      salesMrp: numericOrNull(metric.salesMrp ?? metric.sales_mrp ?? metric.sales_abetted_mrp),
      pldBurn: numericOrNull(metric.pldBurn ?? metric.pld_burn ?? metric.ucode_discount),
      discountPct: normalizePldPct(metric.discountPct ?? metric.discount_pct ?? metric.pld_perc ?? metric.currentPldPct),
      soldQty: numericOrNull(metric.soldQty ?? metric.ucode_sold_qty),
      soldValue: numericOrNull(metric.soldValue ?? metric.ucode_sold_value),
      eprValue: numericOrNull(metric.eprValue ?? metric.epr_value),
      source: String(metric.source || "")
    };
  }

  function normalizeCityPld(cityPld) {
    return Object.entries(cityPld || {}).reduce((acc, [city, metric]) => {
      const normalized = normalizePldMetric({ city, ...(metric || {}) });
      if (normalized) acc[city] = normalized;
      return acc;
    }, {});
  }

  function normalizeQuote(quote) {
    const platform = normalizePlatform(quote.platform);
    const productId = String(quote.productId || quote.product_id || quote.ucode || quote.id || "").trim();
    if (!platform || !productId) return null;
    return {
      productId,
      productName: String(quote.productName || quote.product_name || quote.name || productId),
      platform,
      city: String(quote.city || ""),
      pincode: String(quote.pincode || ""),
      mrp: numericOrNull(quote.mrp),
      price: numericOrNull(quote.price),
      stock: String(quote.stock || quote.availability || "Unknown"),
      url: String(quote.url || ""),
      updatedAt: String(quote.updatedAt || quote.updated_at || new Date().toISOString()),
      discountPct: numericOrNull(quote.discountPct ?? quote.discount_pct ?? quote.discount),
      eta: String(quote.eta || ""),
      source: String(quote.source || ""),
      error: String(quote.error || "")
    };
  }

  function normalizeLinks(links) {
    return Object.entries(links || {}).reduce((acc, [key, value]) => {
      const platform = normalizePlatform(key);
      if (platform && value) acc[platform] = String(value).trim();
      return acc;
    }, {});
  }

  function mergeData(current, incoming) {
    const products = new Map(current.products.map((product) => [product.id, { ...product, links: { ...(product.links || {}) } }]));
    incoming.products.forEach((product) => {
      const existing = products.get(product.id);
      products.set(product.id, existing ? mergeProduct(existing, product) : product);
    });

    const snapshots = new Map();
    [...current.snapshots, ...incoming.snapshots].forEach((quote) => {
      snapshots.set([quote.productId, quote.platform, quote.city, quote.pincode].join("|"), quote);
    });

    return {
      generatedAt: incoming.generatedAt || current.generatedAt || new Date().toISOString(),
      sourceFiles: { ...(current.sourceFiles || {}), ...(incoming.sourceFiles || {}) },
      products: Array.from(products.values()),
      locations: uniqueLocations([...current.locations, ...incoming.locations]),
      snapshots: Array.from(snapshots.values())
    };
  }

  function mergeProduct(existing, incoming) {
    return {
      ...existing,
      name: incoming.name || existing.name,
      ucode: incoming.ucode || existing.ucode,
      category: incoming.category || existing.category,
      pack: incoming.pack || existing.pack,
      salt: incoming.salt || existing.salt,
      mrp: incoming.mrp ?? existing.mrp,
      salesMrp: incoming.salesMrp ?? existing.salesMrp,
      pldBurn: incoming.pldBurn ?? existing.pldBurn,
      currentPldPct: incoming.currentPldPct ?? existing.currentPldPct,
      links: { ...(existing.links || {}), ...(incoming.links || {}) },
      pharmeasyPld: { ...(existing.pharmeasyPld || {}), ...(incoming.pharmeasyPld || {}) },
      overallPld: incoming.overallPld || existing.overallPld || null,
      cityPld: { ...(existing.cityPld || {}), ...(incoming.cityPld || {}) }
    };
  }

  function loadInitialData() {
    try {
      const saved = getStorage()?.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (error) {
      console.debug("Saved dashboard data unavailable", error);
    }
    return window.PRICE_DATA || {};
  }

  function saveData() {
    try {
      const selectedProductsOnly = state.data.products.filter((product) => state.selectedIds.has(product.id));
      getStorage()?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state.data,
          products: selectedProductsOnly,
          locations: state.data.locations,
          snapshots: state.data.snapshots
        })
      );
    } catch (error) {
      console.debug("Dashboard data was not persisted", error);
    }
  }

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const imported = file.name.toLowerCase().endsWith(".json")
          ? JSON.parse(text)
          : csvRowsToData(parseCsv(text));
        state.data = mergeData(state.data, normalizeData(imported));
        setLiveStatus("Sheet imported", "ok");
        renderAll();
      })
      .catch((error) => alert(`Import failed: ${error.message}`))
      .finally(() => {
        event.target.value = "";
      });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field);
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);

    const [header, ...body] = rows;
    if (!header) throw new Error("CSV is empty");
    const keys = header.map(normalizeColumn);
    return body.map((cells) =>
      keys.reduce((acc, key, index) => {
        acc[key] = cells[index]?.trim() || "";
        return acc;
      }, {})
    );
  }

  function csvRowsToData(rows) {
    if (rows[0] && "sales_abetted_mrp" in rows[0] && "pld_perc" in rows[0]) {
      return rows.some((row) => String(row.delivery_city_name || "").trim())
        ? cityLevelRowsToData(rows)
        : overallLevelRowsToData(rows);
    }
    if (rows[0] && "sales_mrp" in rows[0] && "pld_burn" in rows[0]) {
      return burnRowsToData(rows);
    }
    return mappingRowsToData(rows);
  }

  function mappingRowsToData(rows) {
    return {
      generatedAt: new Date().toISOString(),
      locations: DEFAULT_LOCATIONS,
      products: rows.map((row) => {
        const links = {};
        if (row["1mg_link"] || row.tata1mg_url) links["Tata 1MG"] = row["1mg_link"] || row.tata1mg_url;
        if (row.truemeds_link || row.truemeds_url) links.Truemeds = row.truemeds_link || row.truemeds_url;
        return {
          id: row.ucode || row.u_code || row.product_id,
          ucode: row.ucode || row.u_code || row.product_id,
          name: row.product_name || row.name,
          category: row.product_type || row.category,
          links,
          pharmeasyPld: {
            discountPct: numericOrNull(row.pld_discound_on_mrp_for_pharmeasy || row.pld_discount_on_mrp_for_pharmeasy),
            stock: "Given PLD",
            source: "csv_import"
          }
        };
      }),
      snapshots: []
    };
  }

  function burnRowsToData(rows) {
    const byName = new Map();
    rows.forEach((row) => {
      const key = cleanName(row.product_name);
      if (!key) return;
      const existing = byName.get(key) || { salesMrp: 0, pldBurn: 0 };
      existing.salesMrp += numericOrZero(row.sales_mrp);
      existing.pldBurn += numericOrZero(row.pld_burn);
      byName.set(key, existing);
    });
    const products = state.data.products.map((product) => {
      const metrics = byName.get(cleanName(product.name));
      if (!metrics) return product;
      return {
        ...product,
        salesMrp: metrics.salesMrp,
        pldBurn: metrics.pldBurn,
        currentPldPct: metrics.salesMrp ? (metrics.pldBurn / metrics.salesMrp) * 100 : product.currentPldPct,
        pharmeasyPld: {
          ...(product.pharmeasyPld || {}),
          salesMrp: metrics.salesMrp,
          pldBurn: metrics.pldBurn
        }
      };
    });
    return { generatedAt: new Date().toISOString(), locations: DEFAULT_LOCATIONS, products, snapshots: [] };
  }

  function overallLevelRowsToData(rows) {
    const byUcode = aggregatePldRows(rows, false);
    const products = state.data.products.map((product) => {
      const metric = byUcode.get(product.ucode || product.id);
      if (!metric) return product;
      return {
        ...product,
        salesMrp: metric.salesMrp,
        pldBurn: metric.pldBurn,
        currentPldPct: metric.discountPct,
        overallPld: metric,
        pharmeasyPld: {
          ...(product.pharmeasyPld || {}),
          discountPct: metric.discountPct,
          salesMrp: metric.salesMrp,
          pldBurn: metric.pldBurn,
          source: "overall_pld_import"
        }
      };
    });
    return { generatedAt: new Date().toISOString(), locations: DEFAULT_LOCATIONS, products, snapshots: [] };
  }

  function cityLevelRowsToData(rows) {
    const byUcode = aggregatePldRows(rows, true);
    const products = state.data.products.map((product) => {
      const cityPld = byUcode.get(product.ucode || product.id);
      if (!cityPld) return product;
      return {
        ...product,
        cityPld: { ...(product.cityPld || {}), ...cityPld }
      };
    });
    return { generatedAt: new Date().toISOString(), locations: DEFAULT_LOCATIONS, products, snapshots: [] };
  }

  function aggregatePldRows(rows, includeCity) {
    const byKey = new Map();
    rows.forEach((row) => {
      const ucode = String(row.ucode || row.u_code || row.product_id || "").trim();
      const city = includeCity ? String(row.delivery_city_name || "").trim() : "";
      if (!ucode || (includeCity && !city)) return;
      const key = includeCity ? `${ucode}|${city}` : ucode;
      const existing = byKey.get(key) || {
        ucode,
        city,
        salesMrp: 0,
        pldBurn: 0,
        soldQty: 0,
        soldValue: 0,
        eprValue: 0,
        reportedDiscount: 0
      };
      const salesMrp = numericOrZero(row.sales_abetted_mrp);
      const pldPct = normalizePldPct(row.pld_perc);
      existing.salesMrp += salesMrp;
      existing.pldBurn += isFiniteNumber(pldPct) ? salesMrp * Number(pldPct) / 100 : numericOrZero(row.ucode_discount);
      existing.soldQty += numericOrZero(row.ucode_sold_qty);
      existing.soldValue += numericOrZero(row.ucode_sold_value);
      existing.eprValue += numericOrZero(row.epr_value);
      existing.reportedDiscount += numericOrZero(row.ucode_discount);
      byKey.set(key, existing);
    });

    const output = new Map();
    byKey.forEach((value) => {
      const metric = {
        city: value.city,
        salesMrp: value.salesMrp,
        pldBurn: value.pldBurn,
        discountPct: value.salesMrp ? (value.pldBurn / value.salesMrp) * 100 : null,
        soldQty: value.soldQty,
        soldValue: value.soldValue,
        eprValue: value.eprValue,
        reportedDiscount: value.reportedDiscount,
        source: includeCity ? "city_pld_import" : "overall_pld_import"
      };
      if (!includeCity) {
        output.set(value.ucode, metric);
        return;
      }
      const productCities = output.get(value.ucode) || {};
      productCities[value.city] = metric;
      output.set(value.ucode, productCities);
    });
    return output;
  }

  async function exportComparisonCsv(rows) {
    const exportRows = rows.length ? rows : getRows();
    if (!exportRows.length) {
      setLiveStatus("Select products before exporting CSV", "error");
      return;
    }
    const filename = `pld-comparison-${selectedLocations().length}-cities-${selectedProducts().length}-skus.csv`;
    const csv = buildComparisonCsv(exportRows);
    setLiveStatus(`Preparing ${exportRows.length.toLocaleString("en-IN")} CSV rows`, "busy");
    try {
      const saved = await saveCsvToServer(csv, filename);
      setLiveStatus(`CSV ready: ${saved.filename} (${formatBytes(saved.size)})`, "ok", saved.url);
      triggerCsvDownload(saved.url, saved.filename);
    } catch (error) {
      triggerBlobDownload(csv, filename);
      setLiveStatus(`CSV generated in browser; server save failed: ${error.message}`, "warn");
    }
  }

  function buildComparisonCsv(rows) {
    return [comparisonCsvHeader(), ...rows.map(rowToCsv)].map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function comparisonCsvHeader() {
    return [
      "city",
      "pincode",
      "city_metric_name",
      "ucode",
      "product_name",
      "product_type",
      "city_sales_mrp",
      "city_current_pld_burn",
      "city_pharmeasy_pld_pct",
      "city_metric_source",
      "city_row_reduction_pct",
      "city_projected_saving_at_slider",
      "city_projected_pld_saving_at_slider_pp",
      "city_projected_pharmeasy_pld_pct",
      "city_projected_pharmeasy_pld_burn",
      "overall_sales_mrp",
      "overall_current_pld_burn",
      "overall_pharmeasy_pld_pct",
      "overall_reduction_pct",
      "overall_opportunity_platform",
      "overall_opportunity_city",
      "overall_negative_delta_pp",
      "overall_projected_saving_at_slider",
      "overall_projected_pld_saving_at_slider_pp",
      "overall_projected_pharmeasy_pld_pct",
      "overall_projected_pharmeasy_pld_burn",
      "overall_savings_25pct_delta_reduction",
      "overall_pld_saving_25pct_delta_reduction_pp",
      "overall_savings_50pct_delta_reduction",
      "overall_pld_saving_50pct_delta_reduction_pp",
      "overall_savings_75pct_delta_reduction",
      "overall_pld_saving_75pct_delta_reduction_pp",
      "overall_savings_100pct_delta_reduction",
      "overall_pld_saving_100pct_delta_reduction_pp",
      "tata1mg_mrp",
      "tata1mg_price",
      "tata1mg_pld_pct",
      "tata1mg_city_delta_vs_pharmeasy_pp",
      "tata1mg_city_excess_pp",
      "tata1mg_overall_delta_vs_pharmeasy_pp",
      "tata1mg_overall_excess_pp",
      "tata1mg_city_savings_25pct_delta_reduction",
      "tata1mg_city_savings_50pct_delta_reduction",
      "tata1mg_city_savings_75pct_delta_reduction",
      "tata1mg_city_savings_100pct_delta_reduction",
      "truemeds_mrp",
      "truemeds_price",
      "truemeds_pld_pct",
      "truemeds_city_delta_vs_pharmeasy_pp",
      "truemeds_city_excess_pp",
      "truemeds_overall_delta_vs_pharmeasy_pp",
      "truemeds_overall_excess_pp",
      "truemeds_city_savings_25pct_delta_reduction",
      "truemeds_city_savings_50pct_delta_reduction",
      "truemeds_city_savings_75pct_delta_reduction",
      "truemeds_city_savings_100pct_delta_reduction",
      "city_opportunity_platform",
      "city_opportunity_negative_delta_pp",
      "city_slider_reduction_pct",
      "city_opportunity_projected_saving_at_slider",
      "city_opportunity_projected_pld_saving_at_slider_pp",
      "city_opportunity_savings_25pct_delta_reduction",
      "city_opportunity_pld_saving_25pct_delta_reduction_pp",
      "city_opportunity_savings_50pct_delta_reduction",
      "city_opportunity_pld_saving_50pct_delta_reduction_pp",
      "city_opportunity_savings_75pct_delta_reduction",
      "city_opportunity_pld_saving_75pct_delta_reduction_pp",
      "city_opportunity_savings_100pct_delta_reduction",
      "city_opportunity_pld_saving_100pct_delta_reduction_pp",
      "city_ai_insight",
      "overall_ai_insight",
      "combined_ai_insight",
      "updated_at"
    ];
  }

  async function saveCsvToServer(csv, filename) {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ filename, csv })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function triggerCsvDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noreferrer";
    link.click();
  }

  function triggerBlobDownload(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function rowToCsv(row) {
    const tata = row.platforms["Tata 1MG"];
    const truemeds = row.platforms.Truemeds;
    const overall = row.overallScenario || emptyOverallScenario(row.product);
    return [
      row.location.city,
      row.location.pincode,
      row.metricCity,
      row.product.ucode || row.product.id,
      row.product.name,
      row.product.category,
      formatPlainNumber(row.allocatedSalesMrp),
      formatPlainNumber(row.allocatedBurn),
      formatPlainNumber(row.pePld),
      row.metricLabel,
      formatPlainNumber(row.rowReductionPct),
      formatPlainNumber(row.opportunity.sliderSavings),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp)),
      formatPlainNumber(row.projectedPldPct),
      formatPlainNumber(row.projectedBurn),
      formatPlainNumber(overall.salesMrp),
      formatPlainNumber(overall.currentBurn),
      formatPlainNumber(overall.currentPldPct),
      formatPlainNumber(overall.reductionPct),
      overall.platform,
      overall.city,
      formatPlainNumber(overall.delta),
      formatPlainNumber(overall.sliderSavings),
      formatPlainNumber(overall.pldSavingPct),
      formatPlainNumber(overall.projectedPldPct),
      formatPlainNumber(overall.projectedBurn),
      formatPlainNumber(overall.savings25),
      formatPlainNumber(overall.pldSaving25),
      formatPlainNumber(overall.savings50),
      formatPlainNumber(overall.pldSaving50),
      formatPlainNumber(overall.savings75),
      formatPlainNumber(overall.pldSaving75),
      formatPlainNumber(overall.savings100),
      formatPlainNumber(overall.pldSaving100),
      formatPlainNumber(tata.quote?.mrp),
      formatPlainNumber(tata.quote?.price),
      formatPlainNumber(tata.discount),
      formatPlainNumber(tata.delta),
      formatPlainNumber(tata.excess),
      formatPlainNumber(tata.overallDelta),
      formatPlainNumber(tata.overallExcess),
      formatPlainNumber(tata.savings25),
      formatPlainNumber(tata.savings50),
      formatPlainNumber(tata.savings75),
      formatPlainNumber(tata.savings100),
      formatPlainNumber(truemeds.quote?.mrp),
      formatPlainNumber(truemeds.quote?.price),
      formatPlainNumber(truemeds.discount),
      formatPlainNumber(truemeds.delta),
      formatPlainNumber(truemeds.excess),
      formatPlainNumber(truemeds.overallDelta),
      formatPlainNumber(truemeds.overallExcess),
      formatPlainNumber(truemeds.savings25),
      formatPlainNumber(truemeds.savings50),
      formatPlainNumber(truemeds.savings75),
      formatPlainNumber(truemeds.savings100),
      row.opportunity.platform,
      formatPlainNumber(row.opportunity.delta),
      formatPlainNumber(row.rowReductionPct),
      formatPlainNumber(row.opportunity.sliderSavings),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.sliderSavings, row.allocatedSalesMrp)),
      formatPlainNumber(row.opportunity.savings25),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.savings25, row.allocatedSalesMrp)),
      formatPlainNumber(row.opportunity.savings50),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.savings50, row.allocatedSalesMrp)),
      formatPlainNumber(row.opportunity.savings75),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.savings75, row.allocatedSalesMrp)),
      formatPlainNumber(row.opportunity.savings100),
      formatPlainNumber(pldSavingPctFromAmount(row.opportunity.savings100, row.allocatedSalesMrp)),
      cityCsvInsight(row),
      overallCsvInsight(row),
      rowInsight(row),
      [tata.quote?.updatedAt, truemeds.quote?.updatedAt].filter(Boolean).sort().pop() || ""
    ];
  }

  function getLocations() {
    return uniqueLocations([...(state.data.locations || []), ...DEFAULT_LOCATIONS]);
  }

  function uniqueLocations(locations) {
    const seen = new Map();
    locations.forEach((location) => {
      if (!location.city || !location.pincode) return;
      seen.set(`${location.city}|${location.pincode}`, {
        city: String(location.city),
        pincode: String(location.pincode),
        metricCity: String(location.metricCity || location.metric_city || CITY_METRIC_ALIASES[location.city] || location.city)
      });
    });
    return Array.from(seen.values());
  }

  function locationKey(location) {
    return `${location.city}|${location.pincode}`;
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  }

  function weightedAverage(rows, valueGetter, weightGetter) {
    let numerator = 0;
    let denominator = 0;
    rows.forEach((row) => {
      const value = valueGetter(row);
      const weight = numericOrZero(weightGetter(row));
      if (!isFiniteNumber(value) || !weight) return;
      numerator += Number(value) * weight;
      denominator += weight;
    });
    return denominator ? numerator / denominator : null;
  }

  function cappedSavings(currentBurn, salesMrp, excessDeltaPct, reductionPct) {
    const raw = numericOrZero(salesMrp) * (numericOrZero(excessDeltaPct) / 100) * (numericOrZero(reductionPct) / 100);
    return Math.min(numericOrZero(currentBurn), raw);
  }

  function pldSavingPctFromAmount(savings, salesMrp) {
    const base = numericOrZero(salesMrp);
    if (!base) return null;
    return (numericOrZero(savings) / base) * 100;
  }

  function sum(values) {
    return values.reduce((total, value) => total + numericOrZero(value), 0);
  }

  function isAllQuery(value) {
    return String(value || "").trim().toLowerCase() === "all";
  }

  function normalizeColumn(value) {
    return String(value || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
  }

  function normalizePlatform(value) {
    const platform = String(value || "").trim().toLowerCase().replaceAll("_", " ");
    if (["1mg", "tata 1mg", "tata1mg", "tata 1 mg"].includes(platform)) return "Tata 1MG";
    if (["truemed", "truemeds", "true meds"].includes(platform)) return "Truemeds";
    if (["pharmeasy", "pharm easy"].includes(platform)) return "PharmEasy";
    return value ? String(value).trim() : "";
  }

  function numericOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const raw = String(value).trim().replaceAll(",", "").replace("%", "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizePldPct(value) {
    const parsed = numericOrNull(value);
    if (!isFiniteNumber(parsed)) return null;
    return Math.abs(Number(parsed)) <= 1 ? Number(parsed) * 100 : Number(parsed);
  }

  function numericOrZero(value) {
    return numericOrNull(value) || 0;
  }

  function isFiniteNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function formatCurrency(value) {
    if (!isFiniteNumber(value)) return "-";
    const amount = Number(value);
    return `Rs ${amount.toLocaleString("en-IN", { maximumFractionDigits: amount % 1 ? 2 : 0 })}`;
  }

  function formatShortCurrency(value) {
    if (!isFiniteNumber(value)) return "";
    const amount = Number(value);
    if (amount >= 10000000) return `Rs ${(amount / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}Cr`;
    if (amount >= 100000) return `Rs ${(amount / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;
    return formatCurrency(amount);
  }

  function formatPercent(value) {
    if (!isFiniteNumber(value)) return "-";
    return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  }

  function formatSigned(value) {
    if (!isFiniteNumber(value)) return "-";
    const numeric = Number(value);
    return `${numeric > 0 ? "+" : ""}${numeric.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;
  }

  function formatDelta(value) {
    if (!isFiniteNumber(value)) return "-";
    return `${formatSigned(value)} pp`;
  }

  function formatPlainNumber(value) {
    return isFiniteNumber(value) ? Number(value).toFixed(2).replace(/\.00$/, "") : "";
  }

  function formatBytes(value) {
    const bytes = numericOrZero(value);
    if (bytes >= 1048576) return `${(bytes / 1048576).toLocaleString("en-IN", { maximumFractionDigits: 1 })} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KB`;
    return `${bytes.toLocaleString("en-IN")} B`;
  }

  function getStatusClass(stock) {
    const value = String(stock || "").toLowerCase();
    if (value.includes("error") || value.includes("out") || value.includes("unserviceable")) return "out";
    if (value.includes("limited") || value.includes("low")) return "limited";
    if (value.includes("stock") || value.includes("pld")) return "in";
    return "";
  }

  function setLiveStatus(message, stateName, link) {
    if (link) {
      els.liveStatus.innerHTML = `${escapeHtml(message)} <a href="${escapeAttribute(link)}" download>Open CSV</a>`;
    } else {
      els.liveStatus.textContent = message;
    }
    els.liveStatus.dataset.state = stateName;
  }

  function slugify(value) {
    return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }
})();
