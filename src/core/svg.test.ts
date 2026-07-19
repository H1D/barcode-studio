import { describe, it, expect } from 'vitest'
import { renderLabelSvg, renderSheet, renderCalibrationSheet } from './svg'
import { A4_40, DEFAULT_STYLE } from './presets'
import type { Item, SheetSpec } from './types'

// Textbook EAN only.
const ITEM: Item = { sku: 'DEMO-01', ean: '5901234123457', qty: 40 }

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) || []).length
}

describe('renderLabelSvg', () => {
  const svg = renderLabelSvg(ITEM, A4_40, DEFAULT_STYLE)

  it('has the label dimensions in mm', () => {
    expect(svg).toContain('width="52.5mm"')
    expect(svg).toContain('height="29.7mm"')
  })

  it('has a viewBox', () => {
    expect(svg).toContain('viewBox=')
  })

  it('has at least one <rect', () => {
    expect(countMatches(svg, /<rect/g)).toBeGreaterThanOrEqual(1)
  })

  it('draws more than 20 bars', () => {
    expect(countMatches(svg, /<rect/g)).toBeGreaterThan(20)
  })

  it('renders an SKU text and a digits text (default style)', () => {
    // Two <text> elements: SKU + human-readable digits.
    expect(countMatches(svg, /<text/g)).toBe(2)
    expect(svg).toContain('DEMO-01')
    expect(svg).toContain('5901234123457')
  })

  it('has no CSS background', () => {
    expect(svg.toLowerCase()).not.toContain('background')
  })

  it('omits SKU/digits text when disabled', () => {
    const bare = renderLabelSvg(ITEM, A4_40, {
      ...DEFAULT_STYLE,
      showSku: false,
      showDigits: false,
    })
    expect(countMatches(bare, /<text/g)).toBe(0)
    // Bars still present.
    expect(countMatches(bare, /<rect/g)).toBeGreaterThan(20)
  })

  it('throws on an invalid EAN', () => {
    expect(() => renderLabelSvg({ ...ITEM, ean: 'nope' }, A4_40, DEFAULT_STYLE)).toThrow()
  })
})

describe('renderSheet — pagination & fill', () => {
  it('fillPage single item (qty 40) → 1 page', () => {
    const spec: SheetSpec = {
      items: [ITEM],
      stock: A4_40,
      style: DEFAULT_STYLE,
      fill: 'fillPage',
    }
    const pages = renderSheet(spec)
    expect(pages.length).toBe(1)
    expect(pages[0]).toContain('width="210mm"')
    expect(pages[0]).toContain('height="297mm"')
  })

  it('exact with qty 41 → 2 pages', () => {
    const spec: SheetSpec = {
      items: [{ ...ITEM, qty: 41 }],
      stock: A4_40,
      style: DEFAULT_STYLE,
      fill: 'exact',
    }
    const pages = renderSheet(spec)
    expect(pages.length).toBe(2)
    for (const p of pages) expect(p).toContain('width="210mm"')
  })

  it('always returns at least one page (empty spec)', () => {
    const spec: SheetSpec = {
      items: [],
      stock: A4_40,
      style: DEFAULT_STYLE,
      fill: 'exact',
    }
    const pages = renderSheet(spec)
    expect(pages.length).toBe(1)
  })

  it('places 40 nested label svgs on a full page', () => {
    const spec: SheetSpec = {
      items: [ITEM],
      stock: A4_40,
      style: DEFAULT_STYLE,
      fill: 'fillPage',
    }
    const pages = renderSheet(spec)
    // Root svg + 40 nested cell svgs = 41 <svg tags.
    expect(countMatches(pages[0], /<svg/g)).toBe(41)
  })

  it('emits no CSS background anywhere', () => {
    const spec: SheetSpec = {
      items: [{ ...ITEM, qty: 41 }],
      stock: A4_40,
      style: DEFAULT_STYLE,
      fill: 'exact',
    }
    for (const p of renderSheet(spec)) {
      expect(p.toLowerCase()).not.toContain('background')
    }
  })
})

describe('renderCalibrationSheet', () => {
  const svg = renderCalibrationSheet(A4_40)

  it('is an A4 sheet', () => {
    expect(svg).toContain('width="210mm"')
    expect(svg).toContain('height="297mm"')
  })

  it('has the 100 mm ruler label', () => {
    expect(svg).toContain('100 mm')
  })

  it('outlines every cell (40 rects) plus corner marks', () => {
    // 40 cell outlines.
    expect(countMatches(svg, /<rect/g)).toBe(40)
    // Corner crop marks: 8 lines per cell → plenty of <line elements.
    expect(countMatches(svg, /<line/g)).toBeGreaterThan(40)
  })

  it('has no CSS background', () => {
    expect(svg.toLowerCase()).not.toContain('background')
  })
})
