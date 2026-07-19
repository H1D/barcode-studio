import type { SheetSpec, LabelStock } from '../core'
import { renderSheet, renderLabelSvg, NOMINAL_X_MM, BLOCK_MODULES } from '../core'
import { el } from './dom'

// Live A4 preview. The SVG from core is exact-mm and untouched — we only scale the
// *display* via a CSS transform on a wrapper (max-width based), never by editing the
// SVG's own width/height. That keeps the on-screen preview true to the printable art.

export class Preview {
  readonly root: HTMLElement
  private readonly stage: HTMLElement
  private readonly pageInfo: HTMLElement
  private readonly zoomBox: HTMLElement

  constructor() {
    this.root = el('div', { class: 'preview' })
    this.pageInfo = el('div', { class: 'page-info' }, [''])
    this.stage = el('div', { class: 'a4-stage' })
    this.zoomBox = el('div', { class: 'label-zoom' })

    this.root.append(
      el('div', { class: 'preview-head' }, [
        el('h3', { class: 'ctl-title' }, ['Preview']),
        this.pageInfo,
      ]),
      el('div', { class: 'a4-frame' }, [this.stage]),
      el('p', { class: 'preview-legend' }, [
        'Dashed lines mark the die-cut cells; the shaded strips are the barcode quiet zone — keep them clear. Guides are on screen only and never print.',
      ]),
      el('div', { class: 'zoom-head' }, [el('h3', { class: 'ctl-title' }, ['Single label'])]),
      this.zoomBox,
    )
  }

  /** Full redraw from the current spec. Safe against a throwing/empty core. */
  update(spec: SheetSpec): void {
    let pages: string[] = []
    let error: string | null = null
    try {
      pages = renderSheet(spec)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not render preview.'
    }

    if (error) {
      this.stage.innerHTML = ''
      this.stage.append(el('div', { class: 'preview-empty' }, [error]))
      this.pageInfo.textContent = ''
    } else if (pages.length === 0) {
      this.stage.innerHTML = ''
      this.stage.append(
        el('div', { class: 'preview-empty' }, ['Add at least one valid item to see the sheet.']),
      )
      this.pageInfo.textContent = ''
    } else {
      // Show only the first page in the live preview; report the rest.
      // Wrap the art + a screen-only guide overlay so both scale together.
      this.stage.innerHTML = ''
      const holder = el('div', { class: 'a4-holder' })
      holder.innerHTML = pages[0]
      const svg = holder.querySelector('svg')
      if (svg) {
        svg.removeAttribute('width')
        svg.removeAttribute('height')
        svg.setAttribute('class', 'a4-svg')
      }
      const overlay = buildGuideOverlay(spec.stock, spec.style.magnification)
      if (overlay) holder.insertAdjacentHTML('beforeend', overlay)
      this.stage.append(holder)
      this.pageInfo.textContent =
        pages.length > 1 ? `Page 1 of ${pages.length}` : '40 labels per sheet'
    }

    this.updateZoom(spec)
  }

  private updateZoom(spec: SheetSpec): void {
    const first = spec.items[0]
    this.zoomBox.innerHTML = ''
    if (!first) {
      this.zoomBox.append(el('div', { class: 'preview-empty' }, ['—']))
      return
    }
    try {
      const svg = renderLabelSvg(first, spec.stock, spec.style)
      this.zoomBox.innerHTML = svg
      const node = this.zoomBox.querySelector('svg')
      if (node) {
        node.removeAttribute('width')
        node.removeAttribute('height')
        node.setAttribute('class', 'label-svg')
      }
    } catch {
      this.zoomBox.append(el('div', { class: 'preview-empty' }, ['—']))
    }
  }
}

/**
 * Screen-only guide overlay: an exact-mm SVG (same viewBox as the page) drawing
 * faint dashed die-cut cell boundaries plus a faint quiet-zone band per cell.
 * It carries the `.preview-guides` class, hidden under `@media print`, and is
 * never part of the printed `.print-area`, so it can't leak onto paper or PDF.
 */
function buildGuideOverlay(stock: LabelStock, magnification: number): string | null {
  const { cols, rows, labelWmm, labelHmm, pageWmm, pageHmm } = stock
  const { pageMarginLeftmm, pageMarginTopmm, gutterXmm, gutterYmm } = stock
  if (!(pageWmm > 0) || !(pageHmm > 0)) return null

  // Full barcode block (symbol + quiet zones), centered in each cell.
  const blockW = Math.min(labelWmm, BLOCK_MODULES * NOMINAL_X_MM * magnification)
  const blockLeftInCell = (labelWmm - blockW) / 2

  const parts: string[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = pageMarginLeftmm + col * (labelWmm + gutterXmm)
      const y = pageMarginTopmm + row * (labelHmm + gutterYmm)
      // Quiet-zone / keep-clear band behind the barcode.
      parts.push(
        `<rect x="${x + blockLeftInCell}" y="${y}" width="${blockW}" height="${labelHmm}" ` +
          `fill="#1f6feb" fill-opacity="0.06"/>`,
      )
      // Dashed die-cut cell boundary.
      parts.push(
        `<rect x="${x}" y="${y}" width="${labelWmm}" height="${labelHmm}" fill="none" ` +
          `stroke="#1f6feb" stroke-opacity="0.35" stroke-width="0.2" stroke-dasharray="1.2 1.2"/>`,
      )
    }
  }

  return (
    `<svg class="preview-guides" xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${pageWmm} ${pageHmm}" preserveAspectRatio="none" aria-hidden="true">` +
    `${parts.join('')}</svg>`
  )
}
