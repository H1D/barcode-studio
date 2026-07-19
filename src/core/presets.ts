import type { LabelStock, LabelStyle, SheetSpec } from './types'

/**
 * A4 40-up edge-to-edge stock — the print-verified default. Edge-to-edge:
 * 4×52.5=210mm, 10×29.7=297mm = exact A4, zero margins, zero gutters.
 * Print at 100%.
 */
export const A4_40: LabelStock = {
  id: 'a4-40',
  name: 'A4 40-up edge-to-edge (52.5 × 29.7 mm, Avery 3651-compatible)',
  verified: true,
  cols: 4,
  rows: 10,
  labelWmm: 52.5,
  labelHmm: 29.7,
  pageWmm: 210,
  pageHmm: 297,
  pageMarginTopmm: 0,
  pageMarginLeftmm: 0,
  gutterXmm: 0,
  gutterYmm: 0,
}

/**
 * Avery L7160 / J8160 21-up (63.5 × 38.1 mm, 3×7). Has real page margins and a
 * horizontal gutter. Offsets from the Avery spec but NOT yet scan-verified on
 * physical stock → `verified:false`; the UI must flag it "test before trusting".
 */
export const AVERY_L7160: LabelStock = {
  id: 'avery-l7160',
  name: 'Avery L7160 21-up (63.5 × 38.1 mm) — UNVERIFIED',
  verified: false,
  cols: 3,
  rows: 7,
  labelWmm: 63.5,
  labelHmm: 38.1,
  pageWmm: 210,
  pageHmm: 297,
  pageMarginTopmm: 15.15,
  pageMarginLeftmm: 7.21,
  gutterXmm: 2.5,
  gutterYmm: 0,
}

/**
 * Avery L7159 24-up (63.5 × 33.9 mm, 3×8). Offsets from the Avery spec but NOT
 * yet scan-verified on physical stock → `verified:false`.
 */
export const AVERY_L7159: LabelStock = {
  id: 'avery-l7159',
  name: 'Avery L7159 24-up (63.5 × 33.9 mm) — UNVERIFIED',
  verified: false,
  cols: 3,
  rows: 8,
  labelWmm: 63.5,
  labelHmm: 33.9,
  pageWmm: 210,
  pageHmm: 297,
  pageMarginTopmm: 12.9,
  pageMarginLeftmm: 7.25,
  gutterXmm: 2.5,
  gutterYmm: 0,
}

/**
 * Avery 3475 24-up (70 × 36 mm, 3×8). Edge-to-edge horizontally. NOT yet
 * scan-verified on physical stock → `verified:false`.
 */
export const AVERY_3475: LabelStock = {
  id: 'avery-3475',
  name: 'Avery 3475 24-up (70 × 36 mm) — UNVERIFIED',
  verified: false,
  cols: 3,
  rows: 8,
  labelWmm: 70,
  labelHmm: 36,
  pageWmm: 210,
  pageHmm: 297,
  pageMarginTopmm: 4.5,
  pageMarginLeftmm: 0,
  gutterXmm: 0,
  gutterYmm: 0,
}

export const STOCKS: LabelStock[] = [A4_40, AVERY_L7160, AVERY_L7159, AVERY_3475]

/** Layout constants print-verified on physical stock, as the default style. */
export const DEFAULT_STYLE: LabelStyle = {
  skuTopPadMm: 2.2,
  digBotPadMm: 2.2,
  magnification: 1.0,
  skuFontPt: 8,
  digitFontPt: 9,
  showSku: true,
  showDigits: true,
}

/** Seed spec shown on first load — DEMO values only, never the real catalog. */
export const DEFAULT_SPEC: SheetSpec = {
  items: [{ sku: 'DEMO-01', ean: '5901234123457', qty: 40 }],
  stock: A4_40,
  style: DEFAULT_STYLE,
  fill: 'fillPage',
}

/** Scan-safety floor: below this magnification, bars get unreliable on cheap lasers. */
export const MIN_SAFE_MAGNIFICATION = 0.9
