# Barcode Studio — EAN-13 label sheet generator

Free, 100% client-side generator for **print-perfect A4 EAN-13 barcode label sheets**.
Enter SKU + EAN, pick a label stock (or define a custom one), tune layout, and download
a deterministic vector PDF or print directly. No backend, no signup — nothing leaves
your browser.

**Use it now: <https://labels.artems.net/>**

## Why it exists

Marketplace fulfilment (e.g. bol.com, Amazon) needs one scannable GS1 EAN-13 per
sellable unit on a flat surface. This makes the sticker sheets: correct guard bars,
enforced quiet zones, SKU on top, human-readable digits that never occlude the bars.

## Print correctly (read this)

The whole point is exact millimetre registration on the die-cut sheet. Browsers will
silently rescale if you let them.

1. **Print the calibration sheet first.** Measure the 100 mm ruler bar with a real ruler.
   If it isn't exactly 100 mm, your print pipeline is scaling — fix it before printing labels.
2. **Print at 100% / "Actual size".** Chrome/Edge: *Margins = Default, Scale = 100, uncheck
   "Fit to page"*. Firefox: *Scale 100 / Ignore scaling*. Safari: *uncheck "Scale to fit", 100%*.
3. **Matte/uncoated label stock, black bars only.** Glossy film reflects the scan beam.
4. **One visible barcode per unit** — cover any other code on the product.
5. Print one real sheet and **scan several labels (including the corners) with 2+ scanners**
   before trusting a batch.

## Label stock support

- **A4 40-up edge-to-edge** (52.5 × 29.7 mm, 4 × 10, Avery 3651-compatible) — the
  default, print-verified on physical stock.
- **Avery L7160** 21-up (63.5 × 38.1 mm) — geometry from datasheet, unverified.
- **Avery L7159** 24-up (63.5 × 33.9 mm) — geometry from datasheet, unverified.
- **Avery 3475** 24-up (70 × 36 mm) — geometry from datasheet, unverified.
- **Custom sizes** — define your own grid, label dimensions, margins, and gutters.

Always run the calibration sheet against a new stock before printing a batch.

## Shareable URLs

The address bar always mirrors the current setup (only fields that differ from
the defaults appear), so copying the URL shares your exact sheet. Query params
also work as input — they override any locally saved state on load:

```
?item=EAN:QTY:SKU        one per row, repeatable; 12-digit EANs get their
                         checksum computed (SKU may contain colons)
?stock=<preset id>       a4-40, avery-l7160, avery-l7159, avery-3475
?fill=exact|fillPage
?mag=0.9                 barcode magnification (0.8–1.0)
?skuPad / digPad         text padding in mm
?skuFont / digFont       font sizes in pt
?showSku / showDigits    1 or 0
```

Example: `?item=4006381333931:24:SHELF-A&stock=avery-l7159&fill=exact`

Out-of-bounds or malformed values are ignored individually. Custom stock
geometry lives only in localStorage and is not encoded in the URL.

## Develop

```bash
bun install
bun run dev        # local dev server
bun run test       # vitest — encoder + geometry
bun run typecheck
bun run lint
bun run build      # -> dist/
```

## Architecture

- `src/core/` — pure, dependency-light engine (no DOM):
  - `ean13.ts` — hand-rolled EAN-13 encoder + checksum (`normalizeEan`, `encodeEan13`).
  - `svg.ts` — one label / full paginated sheet as exact-mm SVG (`renderLabelSvg`, `renderSheet`).
  - `pdf.ts` — deterministic vector A4 PDF via jsPDF + svg2pdf.js (`sheetToPdfBlob`).
  - `types.ts` / `presets.ts` — frozen contract + label-stock presets.
- `src/ui/`, `src/main.ts` — form, editable item table, live preview, print CSS, calibration.

The UI imports only `src/core` — the engine is UI-agnostic and unit-tested.

## Deploy

Cloudflare Pages via GitHub Actions (`.github/workflows/deploy.yml`), gated on the
`CLOUDFLARE_API_TOKEN` secret. CI (lint + typecheck + test + build) must pass; green
owner PRs auto-merge. First deploy bootstraps the Pages project out-of-band (CI can't
create it).

## License

[MIT](./LICENSE)
