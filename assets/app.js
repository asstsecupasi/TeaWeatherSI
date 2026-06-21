(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Color scales: each is an array of hex stops from low -> high.
  // ---------------------------------------------------------------
  const SCALES = {
    green: ["#E3EEDC", "#BFD4B8", "#7FAE7C", "#3F6F52", "#173628"],
    gold:  ["#F3E7C4", "#EBD9A4", "#DDB868", "#C99A3B", "#8C6320"],
    blue:  ["#DCE8F3", "#BBD3E8", "#7AA9D2", "#4079AE", "#173E66"],
    teal:  ["#DCEFEA", "#B7DAD2", "#6FB2A4", "#1F7A6C", "#0F4A41"],
    amber: ["#F5E5C8", "#EFCB9A", "#DDA15C", "#B5732A", "#7A4514"],
    red:   ["#F4DCD6", "#E8B7AC", "#D17B65", "#B0392C", "#6E1F16"],
  };
  const NO_DATA_COLOR = "#CFCBBE";

  function hexToRgb(hex) {
    const v = hex.replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function rgbToHex([r, g, b]) {
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function colorFromScale(scaleName, t) {
    const stops = SCALES[scaleName] || SCALES.green;
    t = Math.max(0, Math.min(1, t));
    const segCount = stops.length - 1;
    const segT = t * segCount;
    const i = Math.min(segCount - 1, Math.floor(segT));
    const localT = segT - i;
    const c0 = hexToRgb(stops[i]);
    const c1 = hexToRgb(stops[i + 1]);
    return rgbToHex([lerp(c0[0], c1[0], localT), lerp(c0[1], c1[1], localT), lerp(c0[2], c1[2], localT)]);
  }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const state = {
    data: null,
    geojson: null,
    metricKey: "production",
    monthIndex: 0,
    selectedDistrict: "Wayanad",
    showDemo: true,
    playing: false,
    playTimer: null,
  };

  let map, geoLayer, trendChart;
  const layerByDistrict = {};

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  Promise.all([
    fetch("data/tea_weather_data.json").then((r) => r.json()),
    fetch("data/kerala_district.geojson").then((r) => r.json()),
  ]).then(([data, geojson]) => {
    state.data = data;
    state.geojson = geojson;
    init();
  }).catch((err) => {
    document.getElementById("map").innerHTML =
      '<p style="padding:2rem;font-family:sans-serif;">Could not load data files. ' + err + "</p>";
  });

  function init() {
    buildMetricSelect();
    buildDistrictList();
    buildYearTicks();
    initMap();
    bindControls();
    selectDistrict(state.selectedDistrict);
    updateAll();
  }

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------
  function buildMetricSelect() {
    const sel = document.getElementById("metricSelect");
    const groups = {};
    Object.entries(state.data.metrics).forEach(([key, meta]) => {
      groups[meta.group] = groups[meta.group] || [];
      groups[meta.group].push([key, meta]);
    });
    Object.entries(groups).forEach(([groupName, entries]) => {
      const og = document.createElement("optgroup");
      og.label = groupName;
      entries.forEach(([key, meta]) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = meta.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.value = state.metricKey;
  }

  function buildDistrictList() {
    const ul = document.getElementById("districtList");
    state.data.metadata.tea_districts.forEach((name) => {
      const d = state.data.districts[name];
      const li = document.createElement("li");
      li.dataset.district = name;
      li.innerHTML =
        `<span><span class="real-dot" style="background:${d.is_real ? "var(--mid-green)" : "var(--gold)"}"></span>${name}</span>` +
        `<span class="pct">${d.acreage_share_pct}%</span>`;
      li.addEventListener("click", () => selectDistrict(name));
      ul.appendChild(li);
    });
  }

  function buildYearTicks() {
    const wrap = document.getElementById("yearTicks");
    const [startDate] = state.data ? [] : [];
    for (let y = 2015; y <= 2024; y++) {
      const span = document.createElement("span");
      span.textContent = y;
      wrap.appendChild(span);
    }
  }

  function bindControls() {
    document.getElementById("metricSelect").addEventListener("change", (e) => {
      state.metricKey = e.target.value;
      renderChart();
      updateAll();
    });

    document.getElementById("demoToggle").addEventListener("change", (e) => {
      state.showDemo = e.target.checked;
      recolorMap();
    });

    const timeline = document.getElementById("timeline");
    timeline.addEventListener("input", (e) => {
      state.monthIndex = parseInt(e.target.value, 10);
      updateAll();
    });

    document.querySelector(".timeline-track-wrap").addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      state.monthIndex = Math.max(0, Math.min(119, state.monthIndex + dir));
      timeline.value = state.monthIndex;
      updateAll();
    }, { passive: false });

    document.getElementById("playBtn").addEventListener("click", togglePlay);

    document.getElementById("speedSelect").addEventListener("change", () => {
      if (state.playing) { stopPlay(); startPlay(); }
    });

    document.getElementById("toggleDisclaimer").addEventListener("click", () => {
      document.getElementById("disclaimerBanner").classList.toggle("hidden");
    });
    document.getElementById("dismissDisclaimer").addEventListener("click", () => {
      document.getElementById("disclaimerBanner").classList.add("hidden");
    });
  }

  function togglePlay() {
    state.playing ? stopPlay() : startPlay();
  }
  function startPlay() {
    state.playing = true;
    document.getElementById("playIcon").hidden = true;
    document.getElementById("pauseIcon").hidden = false;
    const speed = parseInt(document.getElementById("speedSelect").value, 10);
    state.playTimer = setInterval(() => {
      state.monthIndex = (state.monthIndex + 1) % 120;
      document.getElementById("timeline").value = state.monthIndex;
      updateAll();
    }, speed);
  }
  function stopPlay() {
    state.playing = false;
    document.getElementById("playIcon").hidden = false;
    document.getElementById("pauseIcon").hidden = true;
    clearInterval(state.playTimer);
  }

  // ---------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------
  function initMap() {
    map = L.map("map", { zoomControl: true, attributionControl: false, minZoom: 6 });

    geoLayer = L.geoJSON(state.geojson, {
      style: styleForFeature,
      onEachFeature: (feature, layer) => {
        const name = feature.properties.DISTRICT;
        layerByDistrict[name] = layer;
        layer.on("mouseover", (e) => showTooltip(e, name));
        layer.on("mousemove", (e) => positionTooltip(e));
        layer.on("mouseout", hideTooltip);
        layer.on("click", () => selectDistrict(name));
      },
    }).addTo(map);

    map.fitBounds(geoLayer.getBounds(), { padding: [16, 16] });
  }

  function recordFor(district, monthIndex) {
    const d = state.data.districts[district];
    if (!d || d.no_data) return null;
    return d.records[monthIndex] || null;
  }

  function styleForFeature(feature) {
    const name = feature.properties.DISTRICT;
    const d = state.data.districts[name];
    const base = { weight: 1, color: "#FFFDF8", fillOpacity: 0.92 };

    if (!d || d.no_data) {
      return { ...base, fillColor: NO_DATA_COLOR, fillOpacity: 0.5, dashArray: "3,3" };
    }
    if (!d.is_real && !state.showDemo) {
      return { ...base, fillColor: NO_DATA_COLOR, fillOpacity: 0.35, dashArray: "2,4" };
    }
    const rec = recordFor(name, state.monthIndex);
    if (!rec || rec[state.metricKey] === null || rec[state.metricKey] === undefined) {
      return { ...base, fillColor: NO_DATA_COLOR, fillOpacity: 0.5 };
    }
    const range = state.data.metric_ranges[state.metricKey];
    const t = (rec[state.metricKey] - range.color_min) / (range.color_max - range.color_min || 1);
    const scaleName = state.data.metrics[state.metricKey].scale;
    const color = colorFromScale(scaleName, t);
    const isSelected = name === state.selectedDistrict;
    return { ...base, fillColor: color, weight: isSelected ? 3 : 1, color: isSelected ? "#173628" : "#FFFDF8" };
  }

  function recolorMap() {
    geoLayer.setStyle(styleForFeature);
  }

  // ---------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------
  function showTooltip(e, name) {
    const el = document.getElementById("mapTooltip");
    const meta = state.data.metrics[state.metricKey];
    const d = state.data.districts[name];
    let body;
    if (!d || d.no_data) {
      body = "No tea cultivation recorded";
    } else {
      const rec = recordFor(name, state.monthIndex);
      const val = rec ? formatValue(state.metricKey, rec[state.metricKey]) : "—";
      body = `${meta.label}: <strong style="color:#fff">${val}</strong>` +
        `<div class="tt-demo">${d.is_real ? "Real measured data" : "Demo / illustrative"}</div>`;
    }
    el.innerHTML = `<strong>${name}</strong>${body}`;
    el.hidden = false;
    positionTooltip(e);
  }
  function positionTooltip(e) {
    const el = document.getElementById("mapTooltip");
    const stage = document.querySelector(".map-stage").getBoundingClientRect();
    const x = e.originalEvent.clientX - stage.left + 14;
    const y = e.originalEvent.clientY - stage.top + 14;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  function hideTooltip() {
    document.getElementById("mapTooltip").hidden = true;
  }

  // ---------------------------------------------------------------
  // Legend
  // ---------------------------------------------------------------
  function renderLegend() {
    const meta = state.data.metrics[state.metricKey];
    const range = state.data.metric_ranges[state.metricKey];
    const stops = SCALES[meta.scale];
    const gradient = `linear-gradient(to right, ${stops.join(",")})`;
    const el = document.getElementById("legend");
    el.innerHTML = `
      <div class="legend-bar" style="background:${gradient}"></div>
      <div class="legend-labels">
        <span>${formatValue(state.metricKey, range.color_min)}</span>
        <span>${formatValue(state.metricKey, range.color_max)}</span>
      </div>
      <div class="legend-nodata"><span class="swatch"></span> No tea cultivation</div>
    `;
    document.getElementById("metricUnit").textContent = `Unit: ${meta.unit}`;
  }

  function formatValue(metricKey, value) {
    if (value === null || value === undefined) return "—";
    const meta = state.data.metrics[metricKey];
    return `${Number(value).toFixed(meta.decimals)} ${meta.unit}`;
  }

  // ---------------------------------------------------------------
  // Detail panel + chart
  // ---------------------------------------------------------------
  function selectDistrict(name) {
    state.selectedDistrict = name;
    document.querySelectorAll("#districtList li").forEach((li) => {
      li.classList.toggle("active", li.dataset.district === name);
    });
    renderDetail();
    recolorMap();
  }

  function renderDetail() {
    const name = state.selectedDistrict;
    const d = state.data.districts[name];
    document.getElementById("detailDistrict").textContent = name;
    const badge = document.getElementById("detailBadge");
    if (!d || d.no_data) {
      badge.textContent = "No tea data";
      badge.className = "badge nodata";
    } else if (d.is_real) {
      badge.textContent = "Real measured data";
      badge.className = "badge real";
    } else {
      badge.textContent = "Demo / illustrative";
      badge.className = "badge demo";
    }
    renderStatGrid();
    renderChart();
  }

  function renderStatGrid() {
    const grid = document.getElementById("statGrid");
    const name = state.selectedDistrict;
    const d = state.data.districts[name];
    if (!d || d.no_data) {
      grid.innerHTML = `<div class="stat-card"><div class="label">Status</div><div class="value">No tea grown here</div></div>`;
      return;
    }
    const key = state.metricKey;
    const vals = d.records.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    const current = d.records[state.monthIndex] ? d.records[state.monthIndex][key] : null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    grid.innerHTML = [
      ["This month", current],
      ["10-yr average", avg],
      ["10-yr minimum", min],
      ["10-yr maximum", max],
    ].map(([label, v]) => `
      <div class="stat-card">
        <div class="label">${label}</div>
        <div class="value">${formatValue(key, v)}</div>
      </div>
    `).join("");
  }

  function renderChart() {
    const name = state.selectedDistrict;
    const d = state.data.districts[name];
    const ctx = document.getElementById("trendChart");
    if (trendChart) trendChart.destroy();
    if (!d || d.no_data) return;

    const key = state.metricKey;
    const meta = state.data.metrics[key];
    const labels = d.records.map((r) => r.date);
    const values = d.records.map((r) => r[key]);
    const accent = SCALES[meta.scale][3];

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: meta.label,
            data: values,
            borderColor: accent,
            backgroundColor: accent + "22",
            fill: true,
            pointRadius: 0,
            borderWidth: 1.6,
            tension: 0.25,
          },
          {
            label: "Selected month",
            data: values.map((v, i) => (i === state.monthIndex ? v : null)),
            borderColor: "#173628",
            backgroundColor: "#C99A3B",
            pointRadius: 5,
            pointHoverRadius: 6,
            showLine: false,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              font: { size: 9 },
              autoSkip: false,
              maxRotation: 0,
              callback: (val, idx) => (labels[idx] && labels[idx].endsWith("-01") ? labels[idx].slice(0, 4) : ""),
            },
            grid: { display: false },
          },
          y: { ticks: { font: { size: 9 } }, grid: { color: "#DCD5BE" } },
        },
      },
    });
  }

  function updateChartMarker() {
    if (!trendChart) return;
    const values = trendChart.data.datasets[0].data;
    trendChart.data.datasets[1].data = values.map((v, i) => (i === state.monthIndex ? v : null));
    trendChart.update("none");
  }

  // ---------------------------------------------------------------
  // Global refresh
  // ---------------------------------------------------------------
  function updateAll() {
    const rec = state.data.districts["Wayanad"].records[state.monthIndex];
    const [y, m] = rec.date.split("-");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    document.getElementById("monthLabel").textContent = `${monthNames[parseInt(m, 10) - 1]} ${y}`;

    renderLegend();
    recolorMap();
    renderStatGrid();
    updateChartMarker();
  }
})();
