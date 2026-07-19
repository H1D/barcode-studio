import { describe, it, expect } from 'vitest'
import { A4_40, STOCKS } from './presets'

describe('A4_40 preset', () => {
  it('tiles edge-to-edge to exact A4', () => {
    expect(A4_40.cols * A4_40.labelWmm).toBe(A4_40.pageWmm) // 4 × 52.5 = 210
    expect(A4_40.rows * A4_40.labelHmm).toBeCloseTo(A4_40.pageHmm, 6) // 10 × 29.7 = 297
    expect(A4_40.cols * A4_40.rows).toBe(40)
    expect(A4_40.gutterXmm).toBe(0)
    expect(A4_40.gutterYmm).toBe(0)
  })
})

describe('STOCKS catalog invariants', () => {
  const EPS = 1e-6

  for (const stock of STOCKS) {
    it(`${stock.id}: grid fits the page`, () => {
      const gridW =
        stock.pageMarginLeftmm + stock.cols * stock.labelWmm + (stock.cols - 1) * stock.gutterXmm
      const gridH =
        stock.pageMarginTopmm + stock.rows * stock.labelHmm + (stock.rows - 1) * stock.gutterYmm
      expect(gridW).toBeLessThanOrEqual(stock.pageWmm + EPS)
      expect(gridH).toBeLessThanOrEqual(stock.pageHmm + EPS)
    })
  }

  it('all stock ids are unique', () => {
    const ids = STOCKS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
