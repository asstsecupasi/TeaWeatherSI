# Kerala Tea & Weather Atlas

An interactive, animated choropleth map of Kerala's tea-growing districts,
built for UPASI to explore monthly production and weather patterns from
2015 to 2024. Pure HTML/CSS/JS static site — no backend, no build step,
deploys to Render.com's free static-site tier.

**Live features**
- Choropleth map (Leaflet.js) of all 14 Kerala districts, colour-coded by
  any of 11 production/weather metrics
- Time scrubber: drag, click-play/pause, or **scroll the mouse wheel**
  over the timeline to step month-by-month through 2015–2024
- Metric filter (Production, Productivity, Rainfall, Rainy/Dry Days,
  Humidity AM/PM, Temperature Min/Max AM/PM)
- Click any district for a full 10-year trend chart + summary stats
- "Show demo districts" toggle to isolate real vs. illustrative data

---

## ⚠️ Data notice — read before sharing externally

The source workbook (`TeaWeatherSI.xlsx`) contains **only one sheet —
Wayanad** — with real measured monthly production and weather data
(2015–2024).

Kerala's tea cultivation is officially confined to seven districts
(Tea Board of India): **Idukki, Wayanad, Kollam, Thiruvananthapuram,
Thrissur, Malappuram and Palakkad** — Idukki and Wayanad together account
for roughly 85–90% of the state's tea acreage.

Since real figures for the other six districts were not available, this
project **derives illustrative demo values** for them by scaling Wayanad's
real monthly series using published district acreage shares and broad
agro-climatic offsets (see `scripts/build_data.py` for the exact method
and assumptions). These derived figures are clearly marked
`"is_real": false` in the data and are labelled **"Demo / Illustrative"**
throughout the UI, with a permanent on-screen disclaimer banner.

**Do not use the demo districts' figures for operational, financial, or
policy decisions.** Replace them with real district data as soon as it
becomes available (see "Updating with real data" below).

The remaining seven Kerala districts (Alappuzha, Ernakulam, Kannur,
Kasaragod, Kottayam, Kozhikode, Pathanamthitta) grow no tea and are shown
on the map as grey "no data" regions.

---

## Project structure

```
kerala-tea-weather-map/
├── index.html                  Main page
├── render.yaml                 Render.com Blueprint (static site)
├── assets/
│   ├── style.css                Design system + layout
│   ├── app.js                   Map, timeline, filters, chart logic
│   └── vendor/                  Leaflet + Chart.js, vendored locally
│       ├── leaflet/
│       └── chartjs/
├── data/
│   ├── kerala_district.geojson  District boundaries (as supplied)
│   └── tea_weather_data.json    Generated combined dataset (committed)
└── scripts/
    ├── build_data.py            Regenerates data/tea_weather_data.json
    ├── requirements.txt         Python deps for build_data.py only
    └── TeaWeatherSI.xlsx        Original source workbook (Wayanad sheet)
```

Leaflet and Chart.js are vendored into `assets/vendor/` rather than
loaded from a CDN, so the deployed site has no third-party JS runtime
dependency beyond Google Fonts (used for headings/body type; the site
still functions if that request is blocked, just with fallback fonts).

---

## Running locally

No build step — just serve the folder statically:

```bash
cd kerala-tea-weather-map
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly via `file://` will not work because the
browser blocks `fetch()` of local JSON files under that protocol — it
must be served over HTTP.)

---

## Deploying to Render.com

1. Push this folder to a GitHub or GitLab repository.
2. In the Render dashboard: **New → Blueprint**, then select the repo.
   Render will detect `render.yaml` automatically and create a **Static
   Site** service — no environment variables or secrets needed.
3. Alternatively, without Blueprint: **New → Static Site**, point it at
   the repo, leave the build command empty (or `echo "no build"`), and
   set the publish directory to `.` (repo root).
4. Render builds and serves the site — done. Every push to the connected
   branch redeploys automatically.

---

## Updating with real data

When real monthly figures for Idukki, Palakkad, Kollam,
Thiruvananthapuram, Thrissur, or Malappuram become available:

1. Add each district as its own sheet in `TeaWeatherSI.xlsx`, matching
   Wayanad's column layout (`Month_Year`, `Production_(m.kg.)`,
   `Productivity_(Kg./Ha.)`, `Rainy_Days`, `Dry_Days`, `Rainfall_(mm.)`,
   `RH_Morning`, `RH_Evening`, `Morning_TempMin/Max`,
   `Evening_TempMin/Max`).
2. In `scripts/build_data.py`, move that district from
   `DISTRICT_PROFILES`'s scaling logic into a direct real-data load (mirror
   how `REAL_DISTRICT = "Wayanad"` is loaded), and set `is_real: True`.
3. Re-run:
   ```bash
   cd scripts
   pip install -r requirements.txt --break-system-packages
   python3 build_data.py
   ```
4. Commit the regenerated `data/tea_weather_data.json` and redeploy.

---

## Tech notes

- **Mapping:** Leaflet.js renders `data/kerala_district.geojson` directly
  (no tile server / API key needed); polygons are coloured client-side
  per the selected metric and month.
- **Colour scale:** normalized against each metric's 3rd–97th percentile
  (not raw min/max) so a handful of extreme outlier months don't wash out
  the colour contrast for typical months; true min/max/average are still
  shown in the district stat cards.
- **Charting:** Chart.js renders each district's full 120-month series
  with a marker on the currently-scrubbed month.
- **No browser storage used** — all state lives in memory for the
  session, per static-site constraints.
