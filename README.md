# eCapital — Investor Database (Discovery Phase POC)

A self-contained web demo of a **centralized investor database** for eCapital's
Finance / Investor Relations team. It replaces the current fragmented mix of
spreadsheets, shared drives, and email inboxes with a single, searchable,
audited application.

> **Status:** Proof-of-concept for the Discovery Phase. Investor Portal,
> payment automation, and Dynamics integration are explicitly **out of scope**.

## Live demo

Once GitHub Pages is enabled for this repository, the demo is published in the
cloud automatically by the workflow in `.github/workflows/deploy.yml` at:

```
https://<owner>.github.io/<repo>/
```

(For this repo: `https://akshooty.github.io/FibonaciSequence1/`.)

You can also run it locally with zero dependencies — see **Run locally** below.

## The three in-scope features

| Feature | What the demo does |
| --- | --- |
| **Investor Profile** | Create/edit/delete investor profiles (individuals & entities) with contact info, KYC status, accreditation, country, and notes. |
| **Investment Records** | Add multiple investment records per investor (fund, amount, currency, units, status, date). Seeded with **2 records per profile**. |
| **Document Storage / Categorization / Search** | Upload documents, tag and categorize them (**KYC, Subscription Agreement, Tax Slip, Other**), preview/download, and search the whole library by name, tag, category, or investor. |

Plus an **Audit Trail** tab — a chronological record of every create / update /
delete / upload, directly addressing the "no audit trail" risk called out in
the Discovery brief.

## Maps to the POC success criteria

- ✅ **~10 investor profiles** created from seed data (10 profiles).
- ✅ **2 investment records per profile** (20 records total).
- ✅ **Upload, categorize and retrieve documents** for all 10 profiles
  (KYC + Subscription Agreement + Tax Slip seeded per investor; uploads,
  category filtering, full-text search, preview, and download all work).
- ✅ No data loss across reloads — data persists in the browser's IndexedDB.

Use the **Reset data** button (top right) to reload the original demo dataset
at any time.

## Architecture

Deliberately dependency-free so it deploys to any static host (GitHub Pages)
and needs no backend, database server, or build step.

```
index.html        # shell: top bar, tabs, search, modal host
css/styles.css    # styling
js/db.js          # IndexedDB wrapper (investors, investments, documents, audit)
js/seed.js        # demo dataset generator (10 investors, 2 investments each, docs)
js/app.js         # UI controller: views, forms, search, audit, routing
.github/workflows/deploy.yml  # auto-deploy to GitHub Pages
```

- **Persistence:** browser IndexedDB. Uploaded files are stored as base64 data
  URLs, so everything works offline and survives reloads.
- **Privacy:** nothing leaves the browser — no network calls, no external
  services. Appropriate for a POC handling sensitive KYC/tax material.

## Run locally

No install required. From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly via `file://` also works in most browsers,
but a local server is recommended so IndexedDB behaves consistently.)

## Notes & limitations (POC)

- AUM figure on the dashboard uses an indicative flat FX conversion — for demo
  display only, not a real valuation.
- Single-browser storage: data is local to the browser/profile it was entered
  in (no multi-user sync). A production build would move persistence to a
  shared backend with authentication and role-based access.
- File size capped at ~8 MB per upload to keep the in-browser store responsive.
