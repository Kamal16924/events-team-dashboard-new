# Events Team Pulse Dashboard

Interactive monthly performance dashboard (HTML + CSS + JavaScript, Chart.js, SheetJS, PapaParse). No build step – works on GitHub Pages.

## Folder structure

```
teampulse-dashboard/
├── index.html      # layout, sidebar, all views
├── style.css       # themes (light/dark) and brand colours
├── script.js       # config, calculations, charts, upload/export
├── assets/
│   └── logo.png    # YOUR company logo (add this file; hidden if missing)
└── README.md
```

## Data format (Google Sheet → CSV / Excel)

One row per Month + Week + Member + Category:

| Month | Week | Member | Category | Generated | Completed | Rejected | Quality | Efficiency | UniqueFeed |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11 | W1 | Bala | Funding | 60 | 55 | 2 | 96.5 | 91.7 | 9 |

- Quality and Efficiency are percentages. If left blank they are calculated:
  Efficiency = Completed ÷ Generated, Quality = (Completed − Rejected) ÷ Completed.
- Team totals are weighted (Efficiency by Generated, Quality by Completed).
- Use the **Template** button in the dashboard to download a ready-to-fill CSV.
- Google Sheets: File → Download → CSV (or .xlsx), then **Upload** in the dashboard.

## Easy edits

- Team, queues, colours, score weights: top of `script.js` (`CONFIG`).
- Data: upload a file, or edit rows in the **Data Editor** page.
- Knowledge Sharing and Operational Updates: edit directly in the tables (saved in the browser).
- Logo: put `assets/logo.png` in the folder.

## Test locally

Double-click `index.html`, or run `python -m http.server 8000` in the folder and open http://localhost:8000.

## Deploy on GitHub Pages

1. Create a GitHub repo (e.g. `teampulse-dashboard`).
2. Upload all files (keep the `assets` folder) to the repo root.
3. Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `/ (root)` → Save.
4. Open `https://<your-username>.github.io/teampulse-dashboard/` after ~1 minute.

Note: edits and uploads are stored in each viewer's browser. To publish new official data for everyone, share the Excel/CSV or change the sample data in `generateSample()`.
