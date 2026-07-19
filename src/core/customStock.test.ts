import { describe, it, expect } from 'vitest'
import {
  CUSTOM_STOCK_ID,
  MIN_CUSTOM_LABEL_W_MM,
  CUSTOM_BOUNDS,
  makeCustomStock,
} from './customStock'
import type { CustomStockFields } from './customStock'

/** A comfortably-valid baseline: 3×8 grid of 60 × 30 mm labels. */
const VALID: CustomStockFields = {
  cols: 3,
  rows: 8,
  labelWmm: 60,
  labelHmm: 30,
  pageMarginTopmm: 10,
  pageMarginLeftmm: 5,
  gutterXmm: 2,
  gutterYmm: 1,
}

describe('makeCustomStock — valid input', () => {
  it('builds a stock with forced A4 page, verified false, and the custom id', () => {
    const stock = makeCustomStock(VALID)
    expect(stock).not.toBeNull()
    if (!stock) return
    expect(stock.id).toBe(CUSTOM_STOCK_ID)
    expect(stock.pageWmm).toBe(210)
    expect(stock.pageHmm).toBe(297)
    expect(stock.verified).toBe(false)
    expect(stock.cols).toBe(3)
    expect(stock.rows).toBe(8)
    expect(stock.labelWmm).toBe(60)
    expect(stock.labelHmm).toBe(30)
    expect(stock.pageMarginTopmm).toBe(10)
    expect(stock.pageMarginLeftmm).toBe(5)
    expect(stock.gutterXmm).toBe(2)
    expect(stock.gutterYmm).toBe(1)
    expect(stock.name).toBe('Custom 24-up (60 × 30 mm)')
  })

  it('accepts a label width exactly at the minimum', () => {
    const stock = makeCustomStock({
      ...VALID,
      cols: 1,
      labelWmm: MIN_CUSTOM_LABEL_W_MM,
    })
    expect(stock).not.toBeNull()
  })

  it('ignores pageWmm/pageHmm/verified/id in the raw input (forced values win)', () => {
    const stock = makeCustomStock({
      ...VALID,
      pageWmm: 500,
      pageHmm: 500,
      verified: true,
      id: 'evil',
    })
    expect(stock).not.toBeNull()
    if (!stock) return
    expect(stock.pageWmm).toBe(210)
    expect(stock.pageHmm).toBe(297)
    expect(stock.verified).toBe(false)
    expect(stock.id).toBe(CUSTOM_STOCK_ID)
  })
})

describe('makeCustomStock — rejections', () => {
  it('rejects label width below the EAN-13-derived minimum', () => {
    expect(makeCustomStock({ ...VALID, labelWmm: MIN_CUSTOM_LABEL_W_MM - 0.01 })).toBeNull()
  })

  it('rejects a grid overflowing the page width', () => {
    // 3 × 70 = 210 fits alone, but a left margin pushes it off the page.
    expect(makeCustomStock({ ...VALID, labelWmm: 70, pageMarginLeftmm: 1, gutterXmm: 0 })).toBeNull()
  })

  it('rejects a grid overflowing the page height', () => {
    // 8 × 38 = 304 > 297.
    expect(makeCustomStock({ ...VALID, labelHmm: 38, pageMarginTopmm: 0, gutterYmm: 0 })).toBeNull()
  })

  it('rejects non-finite fields', () => {
    expect(makeCustomStock({ ...VALID, labelWmm: NaN })).toBeNull()
    expect(makeCustomStock({ ...VALID, gutterXmm: Infinity })).toBeNull()
    expect(makeCustomStock({ ...VALID, rows: -Infinity })).toBeNull()
  })

  it('rejects missing or non-numeric fields', () => {
    const { labelHmm: _omit, ...missing } = VALID
    expect(makeCustomStock(missing)).toBeNull()
    expect(makeCustomStock({ ...VALID, cols: '3' })).toBeNull()
    expect(makeCustomStock(null)).toBeNull()
    expect(makeCustomStock(undefined)).toBeNull()
    expect(makeCustomStock('not an object')).toBeNull()
  })

  it('rejects cols/rows out of bounds', () => {
    expect(makeCustomStock({ ...VALID, cols: 0 })).toBeNull()
    expect(makeCustomStock({ ...VALID, cols: CUSTOM_BOUNDS.cols.max + 1 })).toBeNull()
    expect(makeCustomStock({ ...VALID, rows: 0 })).toBeNull()
    expect(makeCustomStock({ ...VALID, rows: CUSTOM_BOUNDS.rows.max + 1 })).toBeNull()
  })

  it('rejects negative margins/gutters', () => {
    expect(makeCustomStock({ ...VALID, pageMarginLeftmm: -1 })).toBeNull()
    expect(makeCustomStock({ ...VALID, gutterYmm: -0.5 })).toBeNull()
  })

  it('rejects fractional cols/rows (tiler indexes cells with idx % cols)', () => {
    // cols=2.5 passes the naive fit check (5 + 2.5×60 + 1.5×2 = 158 ≤ 210)
    // but would place labels at overlapping fractional column offsets.
    expect(makeCustomStock({ ...VALID, cols: 2.5 })).toBeNull()
    expect(makeCustomStock({ ...VALID, rows: 7.5 })).toBeNull()
  })
})

describe('makeCustomStock — display name', () => {
  it('rounds float-noise dimensions to 0.1 mm in the generated name', () => {
    const stock = makeCustomStock({ ...VALID, labelWmm: 52.532000000000004, labelHmm: 29.700000762939453 })
    expect(stock).not.toBeNull()
    if (!stock) return
    expect(stock.name).toBe('Custom 24-up (52.5 × 29.7 mm)')
    // The geometry itself is NOT rounded — only the display name.
    expect(stock.labelWmm).toBe(52.532000000000004)
  })
})
