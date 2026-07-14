# HarborCrest: Visual Analytics Investigation

Visual analytics system for investigating the TenantThread embargo breach.
VAST Challenge 2026 Mini-Challenge 1 — TU Munich Data Visualization course.

## Live demo
https://syedr-qamar.github.io/TUM-Qamar-MC1/

## Video Explanation
A short video explaining the visual analytical tool can be found at: https://youtu.be/1Fn24SMKndo

## Running locally
Because the data is loaded via `fetch()`, you need a local server:

bash instructions:
- git clone https://github.com/syedr-qamar/TUM-Qamar-MC1.git
- cd TUM-Qamar-MC1
- python3 -m http.server 8000
- # then open http://localhost:8000 on any browser.


## Structure
- `index.html` — layout and CSS
- `main.js`    — all D3.js visualization code
- `data.js`    — MC1 dataset as a JS variable

## Views
- **Step 1** — Annotated event timeline (click circles to select rounds)
- **Step 2** — Behavioral heatmap with automatic anomaly detection
- **Step 3** — Anomaly bar chart (click bars to select rounds)
- **Round Evidence Panel** — Shows out-of-role posts, agent reasoning, and full message log
