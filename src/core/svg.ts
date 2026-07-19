import type { Item, LabelStock, LabelStyle, SheetSpec } from './types'
import { encodeEan13 } from './ean13'
import { NOMINAL_X_MM } from './constants'

// ─────────────────────────────────────────────────────────────────────────────
// SVG rendering. Everything is in exact millimetres: the SVG userspace unit IS a
// millimetre (root <svg> carries width/height in mm + a matching viewBox), so
// svg2pdf reproduces geometry 1:1 without rescaling.
// ─────────────────────────────────────────────────────────────────────────────

/** points → mm (1pt = 1/72 inch = 25.4/72 mm). */
const PT_TO_MM = 0.352777

/** Round to a stable precision so PDF output is deterministic. */
function q(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Produce the INNER SVG content of a label (no root <svg> wrapper), plus the
 * label dimensions. Shared by renderLabelSvg (standalone) and renderSheet
 * (nested per-cell).
 */
function labelInner(item: Item, stock: LabelStock, style: LabelStyle): string {
  const { labelWmm, labelHmm } = stock
  const X = NOMINAL_X_MM * style.magnification
  if (X <= 0) throw new Error('magnification must be > 0')

  // Encode (throws on invalid EAN — defensive; UI validates first).
  const enc = encodeEan13(item.ean)

  const parts: string[] = []

  // ─── Text bands ───
  const skuFontMm = style.skuFontPt * PT_TO_MM
  const digitFontMm = style.digitFontPt * PT_TO_MM
  const cx = labelWmm / 2

  // SKU: TOP at skuTopPadMm from the top edge. dominant-baseline text-before-edge
  // anchors the top of the glyph box at y.
  let skuBandBottom = 0
  if (style.showSku) {
    const top = style.skuTopPadMm
    skuBandBottom = top + skuFontMm
    parts.push(
      `<text x="${q(cx)}" y="${q(top)}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-weight="bold" font-size="${q(skuFontMm)}" text-anchor="middle" ` +
        `dominant-baseline="text-before-edge" fill="#000">${esc(item.sku)}</text>`,
    )
  }

  // Digits: BOTTOM at digBotPadMm from the bottom edge. text-after-edge anchors
  // the bottom of the glyph box at y.
  let digBandTop = labelHmm
  if (style.showDigits) {
    const bottom = labelHmm - style.digBotPadMm
    digBandTop = bottom - digitFontMm
    parts.push(
      `<text x="${q(cx)}" y="${q(bottom)}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${q(digitFontMm)}" text-anchor="middle" ` +
        `dominant-baseline="text-after-edge" fill="#000">${esc(item.ean)}</text>`,
    )
  }

  // ─── Bar band ───
  // The bar block (incl. quiet zones) is BLOCK_MODULES*X wide, horizontally
  // centered. enc.totalModules === BLOCK_MODULES (95 + 11 + 7).
  const blockWidth = enc.totalModules * X
  const blockLeft = (labelWmm - blockWidth) / 2

  // Vertical band between the SKU area and the digit area.
  const bandTop = skuBandBottom
  let bandBottom = digBandTop
  // Digit-occlusion clamp: bar band bottom must be ≥ digit band top. Since
  // digBandTop already IS the digit top, we clamp bandBottom to it. Guard the
  // degenerate case where the SKU area alone already crosses the digit area.
  if (bandBottom < bandTop) bandBottom = bandTop
  const barHeight = Math.max(0, bandBottom - bandTop)

  // Walk the alternating run-lengths. Even index = white (skip), odd = black bar.
  // Snap x to consistent multiples of X (cumulative module count * X + blockLeft)
  // so the PDF is deterministic.
  let moduleCursor = 0
  for (let i = 0; i < enc.modules.length; i++) {
    const runLen = enc.modules[i]
    const isBar = i % 2 === 1
    if (isBar && runLen > 0 && barHeight > 0) {
      const x = blockLeft + moduleCursor * X
      const w = runLen * X
      parts.push(
        `<rect x="${q(x)}" y="${q(bandTop)}" width="${q(w)}" height="${q(barHeight)}" ` +
          `fill="#000" shape-rendering="crispEdges"/>`,
      )
    }
    moduleCursor += runLen
  }

  return parts.join('')
}

/**
 * Render a single label as a standalone <svg> string sized in mm.
 * Throws if the item's EAN is invalid (defensive; UI validates first).
 */
export function renderLabelSvg(item: Item, stock: LabelStock, style: LabelStyle): string {
  const { labelWmm, labelHmm } = stock
  const inner = labelInner(item, stock, style)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${q(labelWmm)}mm" height="${q(labelHmm)}mm" ` +
    `viewBox="0 0 ${q(labelWmm)} ${q(labelHmm)}">${inner}</svg>`
  )
}

/** Expand a SheetSpec into the ordered flat list of labels to place. */
function expandItems(spec: SheetSpec): Item[] {
  const { items, stock, fill } = spec
  const capacity = stock.cols * stock.rows
  const out: Item[] = []
  if (fill === 'fillPage' && items.length === 1) {
    // Single item → fill exactly one page's worth of cells.
    for (let i = 0; i < capacity; i++) out.push(items[0])
    return out
  }
  // 'exact' (and multi-item fillPage): honour each item's qty.
  for (const it of items) {
    const n = Math.max(0, Math.floor(it.qty))
    for (let i = 0; i < n; i++) out.push(it)
  }
  return out
}

/**
 * Tile the spec into A4 pages. Returns one <svg> string per page (≥1).
 * Labels are placed row-major; a new page starts when cols*rows cells fill.
 */
export function renderSheet(spec: SheetSpec): string[] {
  const { stock, style } = spec
  const { cols, rows, labelWmm, labelHmm, pageWmm, pageHmm } = stock
  const { pageMarginLeftmm, pageMarginTopmm, gutterXmm, gutterYmm } = stock
  const perPage = cols * rows

  const labels = expandItems(spec)
  const pageCount = Math.max(1, Math.ceil(labels.length / perPage))

  const pages: string[] = []
  for (let p = 0; p < pageCount; p++) {
    const cells: string[] = []
    for (let idx = 0; idx < perPage; idx++) {
      const globalIdx = p * perPage + idx
      if (globalIdx >= labels.length) break
      const item = labels[globalIdx]
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const x = pageMarginLeftmm + col * (labelWmm + gutterXmm)
      const y = pageMarginTopmm + row * (labelHmm + gutterYmm)
      const inner = labelInner(item, stock, style)
      // Nested <svg> with its own mm viewBox clips content to the cell
      // (overflow hidden is the SVG default for a nested svg viewport).
      cells.push(
        `<svg x="${q(x)}" y="${q(y)}" width="${q(labelWmm)}" height="${q(labelHmm)}" ` +
          `viewBox="0 0 ${q(labelWmm)} ${q(labelHmm)}" overflow="hidden">${inner}</svg>`,
      )
    }
    pages.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${q(pageWmm)}mm" height="${q(pageHmm)}mm" ` +
        `viewBox="0 0 ${q(pageWmm)} ${q(pageHmm)}">${cells.join('')}</svg>`,
    )
  }
  return pages
}

/**
 * A single A4 calibration/registration proof sheet:
 *  (a) a 100 mm horizontal ruler bar with 10 mm ticks + "100 mm — measure me",
 *  (b) the label cell grid outlined with corner crop/registration marks so the
 *      user can verify BOTH scale and die-cut registration after printing.
 * All marks are foreground strokes (no CSS background).
 */
export function renderCalibrationSheet(stock: LabelStock): string {
  const { cols, rows, labelWmm, labelHmm, pageWmm, pageHmm } = stock
  const { pageMarginLeftmm, pageMarginTopmm, gutterXmm, gutterYmm } = stock
  const parts: string[] = []

  // ─── (a) 100 mm ruler ───
  const rulerLen = 100
  const rulerX = Math.max(10, (pageWmm - rulerLen) / 2)
  const rulerY = 20
  // Baseline
  parts.push(
    `<line x1="${q(rulerX)}" y1="${q(rulerY)}" x2="${q(rulerX + rulerLen)}" y2="${q(rulerY)}" ` +
      `stroke="#000" stroke-width="0.3"/>`,
  )
  // Ticks every 10 mm (longer at each end).
  for (let mm = 0; mm <= rulerLen; mm += 10) {
    const tx = rulerX + mm
    const tickH = mm % 100 === 0 ? 6 : mm % 50 === 0 ? 5 : 4
    parts.push(
      `<line x1="${q(tx)}" y1="${q(rulerY)}" x2="${q(tx)}" y2="${q(rulerY + tickH)}" ` +
        `stroke="#000" stroke-width="0.3"/>`,
    )
  }
  parts.push(
    `<text x="${q(rulerX + rulerLen / 2)}" y="${q(rulerY + 12)}" ` +
      `font-family="Helvetica, Arial, sans-serif" font-size="4" text-anchor="middle" ` +
      `fill="#000">100 mm — measure me</text>`,
  )

  // ─── (b) cell grid + corner registration/crop marks ───
  const markLen = Math.min(3, labelWmm / 4, labelHmm / 4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = pageMarginLeftmm + col * (labelWmm + gutterXmm)
      const y = pageMarginTopmm + row * (labelHmm + gutterYmm)
      const x2 = x + labelWmm
      const y2 = y + labelHmm
      // Cell outline (thin) so registration against the die-cut is visible.
      parts.push(
        `<rect x="${q(x)}" y="${q(y)}" width="${q(labelWmm)}" height="${q(labelHmm)}" ` +
          `fill="none" stroke="#000" stroke-width="0.1"/>`,
      )
      // Corner crop marks (four corners, L-shaped strokes).
      const corners: Array<[number, number, number, number]> = [
        // [cornerX, cornerY, dirX, dirY]
        [x, y, 1, 1],
        [x2, y, -1, 1],
        [x, y2, 1, -1],
        [x2, y2, -1, -1],
      ]
      for (const [ccx, ccy, dx, dy] of corners) {
        parts.push(
          `<line x1="${q(ccx)}" y1="${q(ccy)}" x2="${q(ccx + dx * markLen)}" y2="${q(ccy)}" ` +
            `stroke="#000" stroke-width="0.2"/>`,
        )
        parts.push(
          `<line x1="${q(ccx)}" y1="${q(ccy)}" x2="${q(ccx)}" y2="${q(ccy + dy * markLen)}" ` +
            `stroke="#000" stroke-width="0.2"/>`,
        )
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${q(pageWmm)}mm" height="${q(pageHmm)}mm" ` +
    `viewBox="0 0 ${q(pageWmm)} ${q(pageHmm)}">${parts.join('')}</svg>`
  )
}
