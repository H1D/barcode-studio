import { describe, it, expect } from 'vitest'
import { normalizeEan, encodeEan13, _internal } from './ean13'
import type { BarModules } from './types'

// Textbook EANs ONLY — never a real catalog value.
const EAN_A = '5901234123457' // first digit 5 → LGGLLG
const EAN_B = '4006381333931' // first digit 4 → LGLLGG

describe('normalizeEan — checksum compute (12 → 13)', () => {
  it('computes the correct 13th digit', () => {
    // 590123412345 → check digit 7
    const r = normalizeEan('590123412345')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ean).toBe('5901234123457')
  })

  it('strips whitespace before computing', () => {
    const r = normalizeEan('  5901234 12345 ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ean).toBe('5901234123457')
  })
})

describe('normalizeEan — validate (13 digits)', () => {
  it('accepts a valid 13-digit EAN', () => {
    const r = normalizeEan(EAN_A)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ean).toBe(EAN_A)
  })

  it('rejects a deliberately-wrong check digit', () => {
    // Correct check digit is 7; use 3 instead.
    const r = normalizeEan('5901234123453')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/check digit/i)
  })
})

describe('normalizeEan — error cases', () => {
  it('rejects letters', () => {
    const r = normalizeEan('59012A4123457')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/digit/i)
  })

  it('rejects wrong length', () => {
    const r = normalizeEan('12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/12 or 13/i)
  })

  it('rejects empty input', () => {
    const r = normalizeEan('   ')
    expect(r.ok).toBe(false)
  })
})

// ─── Encoder structural assertions ───────────────────────────────────────────

describe('encodeEan13 — structure', () => {
  it('reports 95 symbol modules and 113 total', () => {
    const enc = encodeEan13(EAN_A)
    expect(enc.symbolModules).toBe(95)
    expect(enc.totalModules).toBe(113)
  })

  it('modules sum to totalModules (113)', () => {
    const enc = encodeEan13(EAN_A)
    const sum = enc.modules.reduce((a, b) => a + b, 0)
    expect(sum).toBe(113)
  })

  it('first module is the left quiet zone (11 white)', () => {
    const enc = encodeEan13(EAN_A)
    expect(enc.modules[0]).toBe(11)
  })

  it('last module is the right quiet zone (7 white)', () => {
    const enc = encodeEan13(EAN_A)
    expect(enc.modules[enc.modules.length - 1]).toBe(7)
  })

  it('throws on non-13-digit input', () => {
    expect(() => encodeEan13('123')).toThrow()
  })
})

describe('code table parity', () => {
  it('L-code is odd parity (odd number of 1 bits)', () => {
    for (const p of _internal.L_CODE) {
      const ones = p.split('').filter((b) => b === '1').length
      expect(ones % 2).toBe(1)
    }
  })

  it('G-code is even parity (even number of 1 bits)', () => {
    for (const p of _internal.G_CODE) {
      const ones = p.split('').filter((b) => b === '1').length
      expect(ones % 2).toBe(0)
    }
  })

  it('R-code is the bitwise complement of L-code', () => {
    for (let d = 0; d < 10; d++) {
      const l = _internal.L_CODE[d]
      const r = _internal.R_CODE[d]
      for (let i = 0; i < 7; i++) {
        expect(r[i]).toBe(l[i] === '1' ? '0' : '1')
      }
    }
  })
})

// ─── GOLDEN DECODE TEST ───────────────────────────────────────────────────────
// Encode, then DECODE the module pattern back to the original 13 digits. This
// catches a wrong parity table that would "scan as the wrong number".

/** Rebuild the drawn-symbol bit string (95 bits) from BarModules. */
function symbolBitsFromModules(bm: BarModules): string {
  // Strip the left quiet (index 0) and right quiet (last index); the remaining
  // runs are the 95-module drawn symbol, starting with a bar.
  const runs = bm.modules.slice(1, bm.modules.length - 1)
  let bits = ''
  // After the leading white quiet zone, the next run is a BAR.
  let isBar = true
  for (const len of runs) {
    bits += (isBar ? '1' : '0').repeat(len)
    isBar = !isBar
  }
  return bits
}

const L_CODE = _internal.L_CODE
const G_CODE = _internal.G_CODE
const R_CODE = _internal.R_CODE
const PARITY = _internal.PARITY_PATTERNS

/** Decode a 95-bit symbol back to the 13-digit EAN. */
function decodeSymbol(bits: string): string {
  expect(bits.length).toBe(95)
  expect(bits.slice(0, 3)).toBe('101') // start guard
  expect(bits.slice(45, 50)).toBe('01010') // center guard
  expect(bits.slice(92, 95)).toBe('101') // end guard

  const left: string[] = []
  const parityer: string[] = [] // 'L' or 'G' per left digit
  for (let k = 0; k < 6; k++) {
    const chunk = bits.slice(3 + k * 7, 3 + (k + 1) * 7)
    const li = L_CODE.indexOf(chunk)
    const gi = G_CODE.indexOf(chunk)
    if (li >= 0) {
      left.push(String(li))
      parityer.push('L')
    } else if (gi >= 0) {
      left.push(String(gi))
      parityer.push('G')
    } else {
      throw new Error(`left digit ${k} did not match L or G: ${chunk}`)
    }
  }

  const right: string[] = []
  for (let k = 0; k < 6; k++) {
    const chunk = bits.slice(50 + k * 7, 50 + (k + 1) * 7)
    const ri = R_CODE.indexOf(chunk)
    if (ri < 0) throw new Error(`right digit ${k} did not match R: ${chunk}`)
    right.push(String(ri))
  }

  // Recover the (undrawn) first digit from the parity signature.
  const signature = parityer.join('')
  const first = PARITY.indexOf(signature)
  if (first < 0) throw new Error(`parity signature not found: ${signature}`)

  return String(first) + left.join('') + right.join('')
}

describe('encodeEan13 — golden decode round-trip', () => {
  for (const ean of [EAN_A, EAN_B]) {
    it(`round-trips ${ean}`, () => {
      const enc = encodeEan13(ean)
      const bits = symbolBitsFromModules(enc)
      expect(decodeSymbol(bits)).toBe(ean)
    })
  }

  it('different first digits select different parity classes', () => {
    // 5 → LGGLLG, 4 → LGLLGG : must differ or the first-digit recovery is moot.
    expect(_internal.PARITY_PATTERNS[5]).not.toBe(_internal.PARITY_PATTERNS[4])
  })
})

// ─── GOLDEN FIXTURE: leading-zero (all-L / UPC-A-compatible) parity class ─────
// First digit 0 → parity LLLLLL; every left digit uses the L table. Expected
// bits derived by hand from the standard EAN-13 L/R tables:
//   start 101
//   left  L(0)=0001101 L(1)=0011001 L(2)=0010011 L(3)=0111101 L(4)=0100011 L(5)=0110001
//   center 01010
//   right R(6)=1010000 R(7)=1000100 R(8)=1001000 R(9)=1110100 R(0)=1110010 R(5)=1001110
//   end   101

const EAN_C = '0012345678905' // first digit 0 → LLLLLL

const EAN_C_BITS =
  '101' +
  '0001101' + // L 0
  '0011001' + // L 1
  '0010011' + // L 2
  '0111101' + // L 3
  '0100011' + // L 4
  '0110001' + // L 5
  '01010' +
  '1010000' + // R 6
  '1000100' + // R 7
  '1001000' + // R 8
  '1110100' + // R 9
  '1110010' + // R 0
  '1001110' + // R 5
  '101'

describe('encodeEan13 — golden fixture (leading 0, all-L parity)', () => {
  it('normalizeEan accepts the valid checksum', () => {
    const r = normalizeEan(EAN_C)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ean).toBe(EAN_C)
  })

  it('first digit 0 maps to the all-L parity pattern', () => {
    expect(PARITY[0]).toBe('LLLLLL')
  })

  it('encodes to the hand-derived module bit pattern', () => {
    expect(EAN_C_BITS.length).toBe(95)
    const enc = encodeEan13(EAN_C)
    expect(symbolBitsFromModules(enc)).toBe(EAN_C_BITS)
  })

  it('round-trips through the decoder', () => {
    const enc = encodeEan13(EAN_C)
    expect(decodeSymbol(symbolBitsFromModules(enc))).toBe(EAN_C)
  })
})
