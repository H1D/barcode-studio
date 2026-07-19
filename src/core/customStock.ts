import { BLOCK_MODULES, NOMINAL_X_MM, MIN_MAGNIFICATION } from './constants'
import type { LabelStock } from './types'

/** The reserved id for user-defined stock (only ever one at a time). */
export const CUSTOM_STOCK_ID = 'custom'

/**
 * Smallest label width that can hold a full EAN-13 block (symbol + quiet
 * zones) at the minimum allowed magnification. Derived from the shared
 * geometry constants — no magic number.
 */
export const MIN_CUSTOM_LABEL_W_MM = BLOCK_MODULES * NOMINAL_X_MM * MIN_MAGNIFICATION

/** The 8 user-editable fields of a custom stock (page size is always A4). */
export interface CustomStockFields {
  cols: number
  rows: number
  labelWmm: number
  labelHmm: number
  pageMarginTopmm: number
  pageMarginLeftmm: number
  gutterXmm: number
  gutterYmm: number
}

/** Inclusive min/max bounds per custom-stock field. */
export const CUSTOM_BOUNDS: Record<keyof CustomStockFields, { min: number; max: number }> = {
  cols: { min: 1, max: 20 },
  rows: { min: 1, max: 40 },
  labelWmm: { min: MIN_CUSTOM_LABEL_W_MM, max: 210 },
  labelHmm: { min: 10, max: 297 },
  pageMarginTopmm: { min: 0, max: 100 },
  pageMarginLeftmm: { min: 0, max: 100 },
  gutterXmm: { min: 0, max: 100 },
  gutterYmm: { min: 0, max: 100 },
}

const PAGE_W_MM = 210
const PAGE_H_MM = 297
const EPS = 1e-6

/** Display a mm value rounded to 0.1 (spinner steps can produce float noise). */
function fmtMm(v: number): string {
  return String(Math.round(v * 10) / 10)
}

/**
 * Validate raw (untrusted) custom-stock fields and build a LabelStock.
 * Returns null when any field is missing, non-finite, out of bounds, or the
 * resulting grid does not fit an A4 page. Page size and `verified:false` are
 * FORCED — never taken from the input.
 */
export function makeCustomStock(raw: unknown): LabelStock | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const fields = {} as CustomStockFields
  for (const key of Object.keys(CUSTOM_BOUNDS) as (keyof CustomStockFields)[]) {
    const v = obj[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    // Grid counts must be whole — the tiler indexes cells with `idx % cols`,
    // so a fractional count would place labels at overlapping/off-page offsets.
    if ((key === 'cols' || key === 'rows') && !Number.isInteger(v)) return null
    const { min, max } = CUSTOM_BOUNDS[key]
    if (v < min || v > max) return null
    fields[key] = v
  }

  const { cols, rows, labelWmm, labelHmm, pageMarginTopmm, pageMarginLeftmm, gutterXmm, gutterYmm } =
    fields

  // The whole grid must fit on the page (small epsilon for float noise).
  if (pageMarginLeftmm + cols * labelWmm + (cols - 1) * gutterXmm > PAGE_W_MM + EPS) return null
  if (pageMarginTopmm + rows * labelHmm + (rows - 1) * gutterYmm > PAGE_H_MM + EPS) return null

  return {
    id: CUSTOM_STOCK_ID,
    name: `Custom ${cols * rows}-up (${fmtMm(labelWmm)} × ${fmtMm(labelHmm)} mm)`,
    verified: false,
    cols,
    rows,
    labelWmm,
    labelHmm,
    pageWmm: PAGE_W_MM,
    pageHmm: PAGE_H_MM,
    pageMarginTopmm,
    pageMarginLeftmm,
    gutterXmm,
    gutterYmm,
  }
}
