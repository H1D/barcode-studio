import type { SheetSpec, LabelStock, LabelStyle } from '../core'
import { MIN_SAFE_MAGNIFICATION, NOMINAL_X_MM, BLOCK_MODULES } from '../core'

// ─── Geometry constants ───
// The X-module width and module budget (95 symbol + 11 + 7 quiet zones) are the
// canonical figures from core/constants — imported so the guard math and the
// renderer can never drift apart.

/** pt → mm (1pt = 1/72 inch). */
const PT_TO_MM = 25.4 / 72

/** Hard ceiling on expanded labels (~50 A4 pages of 40-up). */
export const MAX_LABELS = 2000

export type Severity = 'warn' | 'block'

export interface Guard {
  id: string
  severity: Severity
  message: string
}

/** Full barcode block width in mm at a given magnification, quiet zones included. */
export function barcodeBlockWidthMm(magnification: number): number {
  return BLOCK_MODULES * NOMINAL_X_MM * magnification
}

/**
 * Total labels the current spec would expand to. Mirrors core's expandItems:
 * single-item fillPage tiles one full page; otherwise each item's qty is honoured.
 */
export function expandedLabelCount(spec: SheetSpec): number {
  const { items, stock, fill } = spec
  if (fill === 'fillPage' && items.length === 1) {
    return stock.cols * stock.rows
  }
  let total = 0
  for (const it of items) total += Math.max(0, Math.floor(it.qty))
  return total
}

/**
 * Compute every live guard for the current spec. Returns them ordered with
 * blocking guards first. A `block` guard means Print/Download-for-print is unsafe;
 * the app disables those actions while any blocking guard is present.
 */
export function computeGuards(spec: SheetSpec): Guard[] {
  const guards: Guard[] = []
  const { stock, style } = spec

  // (0) Magnification floor.
  if (style.magnification < MIN_SAFE_MAGNIFICATION) {
    guards.push({
      id: 'magnification',
      severity: 'warn',
      message: `Magnification ${(style.magnification * 100).toFixed(
        0,
      )}% — too small, the barcode may not scan reliably on a laser printer.`,
    })
  }

  // (0b) Too many labels — expanding this many would freeze the tab and waste paper.
  const labelCount = expandedLabelCount(spec)
  if (labelCount > MAX_LABELS) {
    guards.push({
      id: 'too-many-labels',
      severity: 'block',
      message: `Too many labels (max ${MAX_LABELS}) — reduce quantities.`,
    })
  }

  // (1) Fit — the barcode block plus its quiet zones must fit the label width.
  const blockW = barcodeBlockWidthMm(style.magnification)
  if (blockW > stock.labelWmm) {
    guards.push({
      id: 'fit-width',
      severity: 'block',
      message: `Barcode + quiet zones need ${blockW.toFixed(1)} mm but the label is only ${stock.labelWmm.toFixed(
        1,
      )} mm wide. Lower the magnification or pick a wider stock.`,
    })
  } else if (blockW > stock.labelWmm - 1) {
    guards.push({
      id: 'fit-width-tight',
      severity: 'warn',
      message: `Barcode + quiet zones fill nearly the whole label width (${blockW.toFixed(
        1,
      )} of ${stock.labelWmm.toFixed(1)} mm). Little margin for print drift.`,
    })
  }

  // (2) Occlusion — text bands must not eat the whole vertical space, leaving no
  //     room for the bar band. Bar-band height = label height minus the SKU band
  //     (top pad + SKU cap height) and the digit band (bottom pad + digit height).
  const occ = occlusion(stock, style)
  if (occ.barBandMm <= 0) {
    guards.push({
      id: 'occlusion',
      severity: 'block',
      message: `No vertical room left for the bars: the SKU and digit bands consume the whole ${stock.labelHmm.toFixed(
        1,
      )} mm label height. Reduce paddings or font sizes.`,
    })
  } else if (occ.barBandMm < 6) {
    guards.push({
      id: 'occlusion-tight',
      severity: 'warn',
      message: `Only ${occ.barBandMm.toFixed(
        1,
      )} mm left for the bars after the SKU and digit bands — short bars scan less reliably.`,
    })
  }

  return guards.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'block' ? -1 : 1))
}

/** Vertical budget: how much height remains for the bar band. */
function occlusion(stock: LabelStock, style: LabelStyle) {
  // Approximate a glyph's vertical footprint as ~1.0× its point size in mm
  // (cap height + descender headroom). Conservative on purpose.
  const skuBandMm = style.showSku ? style.skuTopPadMm + style.skuFontPt * PT_TO_MM : 0
  const digBandMm = style.showDigits ? style.digBotPadMm + style.digitFontPt * PT_TO_MM : 0
  const barBandMm = stock.labelHmm - skuBandMm - digBandMm
  return { skuBandMm, digBandMm, barBandMm }
}

/** True when no guard blocks printing. */
export function isPrintSafe(guards: Guard[]): boolean {
  return !guards.some((g) => g.severity === 'block')
}
