# HarborCrest: Visual Analytics Investigation

Visual analytics system for investigating the TenantThread embargo breach.
VAST Challenge 2026 Mini-Challenge 1 — TU Munich Data Visualization course.

## Live demo
https://YOUR-USERNAME.github.io/harborcrest/

## Running locally
Because the data is loaded via `fetch()`, you need a local server:

```bash
cd harborcrest
python3 -m http.server 8000
# then open http://localhost:8000
```

## Structure
- `index.html` — layout and CSS
- `main.js`    — all D3.js visualization code
- `data.js`    — MC1 dataset as a JS variable

## Views
- **Step 1** — Annotated event timeline (click circles to select rounds)
- **Step 2** — Behavioral heatmap with automatic anomaly detection
- **Step 3** — Anomaly bar chart (click bars to select rounds)
- **Round Evidence Panel** — Shows out-of-role posts, agent reasoning, and full message log
