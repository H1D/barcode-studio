import type { Ean13, BarModules, NormalizeResult } from './types'
import { QUIET_LEFT_MODULES, QUIET_RIGHT_MODULES, SYMBOL_MODULES } from './constants'

// ─────────────────────────────────────────────────────────────────────────────
// EAN-13 encoder + checksum. Hand-rolled, zero deps. See docs/PLAN.md "Re-vet
// fold-ins (final, v2.1)" for the authoritative spec these tables implement.
// ─────────────────────────────────────────────────────────────────────────────

/** L-code 7-bit patterns (1 = bar/black), index = digit. Odd parity. */
const L_CODE: readonly string[] = [
  '0001101', // 0
  '0011001', // 1
  '0010011', // 2
  '0111101', // 3
  '0100011', // 4
  '0110001', // 5
  '0101111', // 6
  '0111011', // 7
  '0110111', // 8
  '0001011', // 9
]

/** R-code = L-code bitwise-complemented (bars ↔ spaces). */
const R_CODE: readonly string[] = L_CODE.map((p) =>
  p
    .split('')
    .map((b) => (b === '1' ? '0' : '1'))
    .join(''),
)

/** G-code = reverse of R-code bits (equivalently: even parity). */
const G_CODE: readonly string[] = R_CODE.map((p) => p.split('').reverse().join(''))

/**
 * First-digit → left-half parity selector. Index = first digit. 'L' uses L_CODE,
 * 'G' uses G_CODE. The first digit is NOT drawn; it is recovered by a scanner
 * from this parity signature across the 6 left digits.
 */
const PARITY_PATTERNS: readonly string[] = [
  'LLLLLL', // 0
  'LLGLGG', // 1
  'LLGGLG', // 2
  'LLGGGL', // 3
  'LGLLGG', // 4
  'LGGLLG', // 5
  'LGGGLL', // 6
  'LGLGLG', // 7
  'LGLGGL', // 8
  'LGGLGL', // 9
]

const START_GUARD = '101'
const CENTER_GUARD = '01010'
const END_GUARD = '101'

/**
 * Compute the EAN-13 check digit for the first 12 digits.
 * Positions 1-indexed from the left; odd ×1, even ×3; check = (10 − sum%10) % 10.
 */
function computeCheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = first12.charCodeAt(i) - 48
    // Position (i+1): odd position → weight 1, even position → weight 3.
    sum += (i + 1) % 2 === 1 ? d : d * 3
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Normalize user input into a 13-digit checksum-valid EAN-13.
 * - strips whitespace
 * - 12 digits → compute the 13th
 * - 13 digits → validate the check digit
 * - anything else → error
 */
export function normalizeEan(input: string): NormalizeResult {
  const cleaned = input.replace(/\s+/g, '')
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: 'EAN must contain digits only (0-9).' }
  }
  if (cleaned.length === 12) {
    const check = computeCheckDigit(cleaned)
    return { ok: true, ean: cleaned + String(check) }
  }
  if (cleaned.length === 13) {
    const expected = computeCheckDigit(cleaned.slice(0, 12))
    const actual = cleaned.charCodeAt(12) - 48
    if (expected !== actual) {
      return {
        ok: false,
        error: `Invalid check digit: expected ${expected}, got ${actual}.`,
      }
    }
    return { ok: true, ean: cleaned }
  }
  return {
    ok: false,
    error: `EAN must be 12 or 13 digits (got ${cleaned.length}).`,
  }
}

/**
 * Convert a bit string (1 = bar/black, 0 = space/white) into alternating
 * run-lengths, starting from a white run. Guarantees strict alternation by
 * prepending a zero-width white run when the pattern starts with a bar.
 */
function bitsToRuns(bits: string): number[] {
  const runs: number[] = []
  // The overall module stream must start white (index 0 = quiet zone / space).
  // We accumulate here assuming the first run is white.
  let expectWhite = true
  let i = 0
  while (i < bits.length) {
    const isBar = bits[i] === '1'
    // Count the length of the current same-value run.
    let len = 0
    while (i < bits.length && (bits[i] === '1') === isBar) {
      len++
      i++
    }
    if (isBar === expectWhite) {
      // Value doesn't match expected polarity → insert a zero-width run to keep
      // strict alternation. (Only happens at the very start when bits[0]==='1'.)
      runs.push(0)
      expectWhite = !expectWhite
    }
    runs.push(len)
    expectWhite = !expectWhite
  }
  return runs
}

/**
 * Encode a 13-digit EAN into alternating module run-lengths (X-modules) from the
 * left. Element 0 is the left quiet zone (white). Strictly alternates
 * white/black (even index = space, odd index = bar).
 *
 * Throws if `ean` is not exactly 13 digits (callers should normalize first).
 */
export function encodeEan13(ean: Ean13): BarModules {
  if (!/^\d{13}$/.test(ean)) {
    throw new Error(`encodeEan13: expected 13 digits, got "${ean}".`)
  }

  const first = ean.charCodeAt(0) - 48
  const parity = PARITY_PATTERNS[first]
  const leftDigits = ean.slice(1, 7)
  const rightDigits = ean.slice(7, 13)

  // Build the drawn symbol as a bit string (SYMBOL_MODULES modules, no quiet
  // zones).
  let symbolBits = START_GUARD
  for (let k = 0; k < 6; k++) {
    const d = leftDigits.charCodeAt(k) - 48
    symbolBits += parity[k] === 'L' ? L_CODE[d] : G_CODE[d]
  }
  symbolBits += CENTER_GUARD
  for (let k = 0; k < 6; k++) {
    const d = rightDigits.charCodeAt(k) - 48
    symbolBits += R_CODE[d]
  }
  symbolBits += END_GUARD

  const symbolModules = symbolBits.length // must equal SYMBOL_MODULES (95)
  if (symbolModules !== SYMBOL_MODULES) {
    throw new Error(`encodeEan13: symbol is ${symbolModules} modules, expected ${SYMBOL_MODULES}.`)
  }

  // Convert symbol bits to run-lengths (starts with the start-guard bar).
  const symbolRuns = bitsToRuns(symbolBits)

  // Prepend the left quiet zone as the first white run, and add it into the
  // start-guard's leading (zero-width) white run so alternation is preserved.
  // bitsToRuns returns [0(white), 1(bar), ...] because the symbol starts with a
  // bar; fold the quiet zone into that leading white run.
  const modules: number[] = symbolRuns.slice()
  modules[0] = QUIET_LEFT_MODULES

  // Append the right quiet zone. The symbol ends with the end-guard bar, so the
  // last run is black; add a trailing white run for the right quiet zone.
  modules.push(QUIET_RIGHT_MODULES)

  const totalModules = QUIET_LEFT_MODULES + symbolModules + QUIET_RIGHT_MODULES

  return { modules, totalModules, symbolModules }
}

// Re-export the code tables for tests (not part of the public UI surface).
export const _internal = { L_CODE, G_CODE, R_CODE, PARITY_PATTERNS, computeCheckDigit }
