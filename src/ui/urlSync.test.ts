import { describe, it, expect } from 'vitest'
import { DEFAULT_SPEC, type SheetSpec } from '../core'
import { clone } from './persist'
import { applySearchToSpec, specToSearch } from './urlSync'

function fresh(): SheetSpec {
  return clone(DEFAULT_SPEC)
}

describe('applySearchToSpec', () => {
  it('returns false and leaves the spec untouched for an empty search', () => {
    const spec = fresh()
    expect(applySearchToSpec(spec, '')).toBe(false)
    expect(spec).toEqual(DEFAULT_SPEC)
  })

  it('parses repeated item params, SKU keeps embedded colons', () => {
    const spec = fresh()
    const ok = applySearchToSpec(
      spec,
      '?item=5901234123457:12:SHELF-A&item=4006381333931:3:A%3AB%3AC',
    )
    expect(ok).toBe(true)
    expect(spec.items).toEqual([
      { sku: 'SHELF-A', ean: '5901234123457', qty: 12 },
      { sku: 'A:B:C', ean: '4006381333931', qty: 3 },
    ])
  })

  it('computes the checksum for a 12-digit EAN', () => {
    const spec = fresh()
    applySearchToSpec(spec, '?item=590123412345:1:X')
    expect(spec.items[0].ean).toBe('5901234123457')
  })

  it('keeps an invalid EAN (capped) so the table can flag it', () => {
    const spec = fresh()
    applySearchToSpec(spec, '?item=1234:1:X')
    expect(spec.items[0].ean).toBe('1234')
  })

  it('defaults a missing qty to 1 and clamps an oversized one', () => {
    const spec = fresh()
    applySearchToSpec(spec, '?item=5901234123457::A&item=5901234123457:99999:B')
    expect(spec.items[0].qty).toBe(1)
    expect(spec.items[1].qty).toBe(2000)
  })

  it('clears items when the param is present but empty', () => {
    const spec = fresh()
    applySearchToSpec(spec, '?item=')
    expect(spec.items).toEqual([])
  })

  it('applies a known stock id and ignores unknown or custom ids', () => {
    const spec = fresh()
    expect(applySearchToSpec(spec, '?stock=avery-l7160')).toBe(true)
    expect(spec.stock.id).toBe('avery-l7160')

    const spec2 = fresh()
    expect(applySearchToSpec(spec2, '?stock=no-such-stock')).toBe(false)
    expect(spec2.stock.id).toBe(DEFAULT_SPEC.stock.id)

    const spec3 = fresh()
    expect(applySearchToSpec(spec3, '?stock=custom')).toBe(false)
    expect(spec3.stock.id).toBe(DEFAULT_SPEC.stock.id)
  })

  it('applies fill and style fields within bounds, ignores out-of-bounds', () => {
    const spec = fresh()
    applySearchToSpec(spec, '?fill=exact&mag=0.9&skuFont=10&showSku=0')
    expect(spec.fill).toBe('exact')
    expect(spec.style.magnification).toBe(0.9)
    expect(spec.style.skuFontPt).toBe(10)
    expect(spec.style.showSku).toBe(false)

    const spec2 = fresh()
    expect(applySearchToSpec(spec2, '?mag=0.5&skuFont=100&showDigits=maybe')).toBe(false)
    expect(spec2.style).toEqual(DEFAULT_SPEC.style)
  })
})

describe('specToSearch', () => {
  it('serializes a default spec to an empty string', () => {
    expect(specToSearch(fresh())).toBe('')
  })

  it('emits only non-default fields', () => {
    const spec = fresh()
    spec.fill = 'exact'
    spec.style.magnification = 0.9
    const qs = specToSearch(spec)
    expect(qs).toContain('fill=exact')
    expect(qs).toContain('mag=0.9')
    expect(qs).not.toContain('stock=')
    expect(qs).not.toContain('item=')
  })

  it('round-trips a modified spec through the URL', () => {
    const spec = fresh()
    spec.items = [{ sku: 'RT:1', ean: '4006381333931', qty: 7 }]
    spec.stock = { ...spec.stock, id: 'avery-l7159' }
    spec.fill = 'exact'
    spec.style.showDigits = false
    spec.style.digitFontPt = 11

    const restored = fresh()
    applySearchToSpec(restored, `?${specToSearch(spec)}`)
    expect(restored.items).toEqual(spec.items)
    expect(restored.stock.id).toBe('avery-l7159')
    expect(restored.fill).toBe('exact')
    expect(restored.style.showDigits).toBe(false)
    expect(restored.style.digitFontPt).toBe(11)
  })

  it('never writes the custom stock id', () => {
    const spec = fresh()
    spec.stock = { ...spec.stock, id: 'custom' }
    expect(specToSearch(spec)).toBe('')
  })

  it('preserves foreign params and replaces its own', () => {
    const spec = fresh()
    spec.fill = 'exact'
    const qs = specToSearch(spec, '?utm_source=news&fill=fillPage&mag=0.9')
    expect(qs).toContain('utm_source=news')
    expect(qs).toContain('fill=exact')
    expect(qs).not.toContain('mag=')
  })
})
