import type { SheetSpec, PersistedState, LabelStock } from '../core'
import { DEFAULT_SPEC, STOCKS, CUSTOM_STOCK_ID, makeCustomStock } from '../core'

const KEY = 'barcode-studio:spec'

// Sane bounds — a config outside these is treated as corrupt and discarded rather
// than silently restored (never resurrect a sub-scan or broken layout).
const BOUNDS = {
  magnification: { min: 0.8, max: 1.0 },
  pad: { min: 0, max: 20 },
  font: { min: 4, max: 24 },
  qty: { min: 1, max: 2000 },
}

// Restored string fields are length-capped so a hand-edited blob can't smuggle in
// a runaway SKU/EAN. EAN is 13 digits max; SKU is a short human label.
const MAX_SKU_LEN = 64
const MAX_EAN_LEN = 13

/** Persist the current spec. Non-fatal on failure (private mode / quota). */
export function saveSpec(spec: SheetSpec): void {
  try {
    const payload: PersistedState = { v: 1, spec }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* storage unavailable — keep running in-memory */
  }
}

/**
 * Load and validate. Returns DEFAULT_SPEC (a fresh clone) on any of: absent,
 * unparseable, wrong version, or out-of-bounds/malformed fields.
 */
export function loadSpec(): SheetSpec {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return clone(DEFAULT_SPEC)
    const parsed = JSON.parse(raw) as unknown
    const spec = validate(parsed)
    return spec ?? clone(DEFAULT_SPEC)
  } catch {
    return clone(DEFAULT_SPEC)
  }
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
}

/** Resolve a persisted stock to a canonical preset (by id) so we never trust
 *  a hand-edited geometry blob from storage. Custom stock is rebuilt through
 *  makeCustomStock, which re-validates every field and forces page dims /
 *  verified / name — never taken from the blob.
 *
 *  Never returns null: rejecting a stock would discard the user's whole saved
 *  spec, items included. Any unresolvable stock (an id retired in an older
 *  release, or a custom blob that fails re-validation) degrades to the default
 *  stock — STOCKS[0], whose canonical geometry is always safe — while the
 *  items survive. Note this substitutes geometry silently; anyone retiring a
 *  preset id whose geometry differs from the default should add an explicit
 *  remap here instead. */
function resolveStock(raw: unknown): LabelStock {
  const rawId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined
  if (rawId === CUSTOM_STOCK_ID) {
    const custom = makeCustomStock(raw)
    if (custom) return custom
  }
  const match = STOCKS.find((s) => s.id === rawId)
  return clone(match ?? STOCKS[0])
}

function validate(parsed: unknown): SheetSpec | null {
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Partial<PersistedState>
  if (p.v !== 1) return null

  const spec = p.spec as Partial<SheetSpec> | undefined
  if (!spec || typeof spec !== 'object') return null

  // Stock: resolves to a canonical preset or a re-validated custom stock;
  // never fails (see resolveStock).
  const stock = resolveStock(spec.stock)

  // Style: every numeric field must be within scan-safe bounds.
  const st = spec.style
  if (!st || typeof st !== 'object') return null
  if (!inRange(st.magnification, BOUNDS.magnification.min, BOUNDS.magnification.max)) return null
  if (!inRange(st.skuTopPadMm, BOUNDS.pad.min, BOUNDS.pad.max)) return null
  if (!inRange(st.digBotPadMm, BOUNDS.pad.min, BOUNDS.pad.max)) return null
  if (!inRange(st.skuFontPt, BOUNDS.font.min, BOUNDS.font.max)) return null
  if (!inRange(st.digitFontPt, BOUNDS.font.min, BOUNDS.font.max)) return null
  if (typeof st.showSku !== 'boolean' || typeof st.showDigits !== 'boolean') return null

  // Fill.
  if (spec.fill !== 'exact' && spec.fill !== 'fillPage') return null

  // Items: array of {sku, ean, qty}. EAN is re-validated live in the table; here
  // we only require the shape and sane qty. Empty array is allowed (fresh sheet).
  if (!Array.isArray(spec.items)) return null
  for (const it of spec.items) {
    if (!it || typeof it !== 'object') return null
    if (typeof it.sku !== 'string' || it.sku.length > MAX_SKU_LEN) return null
    if (typeof it.ean !== 'string' || it.ean.length > MAX_EAN_LEN) return null
    if (typeof it.qty !== 'number' || !Number.isFinite(it.qty)) return null
  }

  return {
    items: spec.items.map((it) => ({
      sku: it.sku,
      ean: it.ean,
      // Clamp any legacy/over-range qty into the safe window rather than rejecting.
      qty: Math.min(BOUNDS.qty.max, Math.max(BOUNDS.qty.min, Math.floor(it.qty))),
    })),
    stock,
    style: {
      skuTopPadMm: st.skuTopPadMm,
      digBotPadMm: st.digBotPadMm,
      magnification: st.magnification,
      skuFontPt: st.skuFontPt,
      digitFontPt: st.digitFontPt,
      showSku: st.showSku,
      showDigits: st.showDigits,
    },
    fill: spec.fill,
  }
}
