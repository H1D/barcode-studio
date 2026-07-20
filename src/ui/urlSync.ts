import type { SheetSpec, Item } from '../core'
import { DEFAULT_SPEC, STOCKS, CUSTOM_STOCK_ID, normalizeEan } from '../core'
import { BOUNDS, MAX_SKU_LEN, MAX_EAN_LEN, inRange, clone } from './persist'

// URL query-param sync. Two directions:
//   • applySearchToSpec — on startup, recognized params override the loaded spec
//     field-by-field (URL beats localStorage; a shared link "just works").
//   • specToSearch — after every change, the URL is rewritten to reflect the
//     current spec so the address bar is always a shareable deep link.
//
// Params (all optional; unrecognized/out-of-bounds values are ignored):
//   item=EAN:QTY:SKU   repeatable, one per row; replaces the whole item list.
//                      SKU is everything after the second colon, so colons in
//                      SKUs survive. 12-digit EANs get their checksum computed.
//   stock=<preset id>  e.g. a4-40, avery-l7160
//   fill=exact|fillPage
//   mag, skuPad, digPad, skuFont, digFont — numeric style fields
//   showSku, showDigits — 1/0 (or true/false)
//
// specToSearch only emits params that differ from DEFAULT_SPEC (short URLs) and
// preserves foreign params (e.g. utm_*) it doesn't own. Custom stock has no
// stable id to reference, so it is never written to — and its id is never read
// from — the URL; geometry stays in localStorage only.

/** Every query key this module owns (cleared before re-serializing). */
const OWN_KEYS = [
  'item',
  'stock',
  'fill',
  'mag',
  'skuPad',
  'digPad',
  'skuFont',
  'digFont',
  'showSku',
  'showDigits',
] as const

/** Cap on `item` params honored from a URL — bounds parse work on a hostile
 *  link; the label-count guard already blocks oversized sheets from printing. */
const MAX_URL_ITEMS = 500

/**
 * Apply recognized query params from `search` onto `spec` (mutates in place).
 * Returns true if any field was overridden. Malformed values are ignored
 * individually — one bad param never discards the rest of the link.
 */
export function applySearchToSpec(spec: SheetSpec, search: string): boolean {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return false
  }
  let applied = false

  const itemParams = params.getAll('item')
  if (itemParams.length > 0) {
    // Present-but-empty (?item=) intentionally clears the list.
    spec.items = itemParams.slice(0, MAX_URL_ITEMS).map(parseItem).filter((it): it is Item => it !== null)
    applied = true
  }

  const stockId = params.get('stock')
  if (stockId !== null && stockId !== CUSTOM_STOCK_ID) {
    const match = STOCKS.find((s) => s.id === stockId)
    if (match) {
      spec.stock = clone(match)
      applied = true
    }
  }

  const fill = params.get('fill')
  if (fill === 'exact' || fill === 'fillPage') {
    spec.fill = fill
    applied = true
  }

  const setNum = (key: string, lo: number, hi: number, assign: (v: number) => void): void => {
    const raw = params.get(key)
    if (raw === null) return
    const v = Number.parseFloat(raw)
    if (!inRange(v, lo, hi)) return
    assign(v)
    applied = true
  }
  setNum('mag', BOUNDS.magnification.min, BOUNDS.magnification.max, (v) => (spec.style.magnification = v))
  setNum('skuPad', BOUNDS.pad.min, BOUNDS.pad.max, (v) => (spec.style.skuTopPadMm = v))
  setNum('digPad', BOUNDS.pad.min, BOUNDS.pad.max, (v) => (spec.style.digBotPadMm = v))
  setNum('skuFont', BOUNDS.font.min, BOUNDS.font.max, (v) => (spec.style.skuFontPt = v))
  setNum('digFont', BOUNDS.font.min, BOUNDS.font.max, (v) => (spec.style.digitFontPt = v))

  const showSku = parseBool(params.get('showSku'))
  if (showSku !== null) {
    spec.style.showSku = showSku
    applied = true
  }
  const showDigits = parseBool(params.get('showDigits'))
  if (showDigits !== null) {
    spec.style.showDigits = showDigits
    applied = true
  }

  return applied
}

/**
 * Serialize `spec` back into a query string, keeping any foreign params found
 * in `currentSearch`. Returns '' when the spec matches DEFAULT_SPEC and no
 * foreign params exist.
 */
export function specToSearch(spec: SheetSpec, currentSearch = ''): string {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(currentSearch)
  } catch {
    params = new URLSearchParams()
  }
  for (const key of OWN_KEYS) params.delete(key)

  if (JSON.stringify(spec.items) !== JSON.stringify(DEFAULT_SPEC.items)) {
    for (const it of spec.items) params.append('item', `${it.ean}:${it.qty}:${it.sku}`)
  }
  if (spec.stock.id !== DEFAULT_SPEC.stock.id && spec.stock.id !== CUSTOM_STOCK_ID) {
    params.set('stock', spec.stock.id)
  }
  if (spec.fill !== DEFAULT_SPEC.fill) params.set('fill', spec.fill)

  const st = spec.style
  const ds = DEFAULT_SPEC.style
  if (st.magnification !== ds.magnification) params.set('mag', String(st.magnification))
  if (st.skuTopPadMm !== ds.skuTopPadMm) params.set('skuPad', String(st.skuTopPadMm))
  if (st.digBotPadMm !== ds.digBotPadMm) params.set('digPad', String(st.digBotPadMm))
  if (st.skuFontPt !== ds.skuFontPt) params.set('skuFont', String(st.skuFontPt))
  if (st.digitFontPt !== ds.digitFontPt) params.set('digFont', String(st.digitFontPt))
  if (st.showSku !== ds.showSku) params.set('showSku', st.showSku ? '1' : '0')
  if (st.showDigits !== ds.showDigits) params.set('showDigits', st.showDigits ? '1' : '0')

  return params.toString()
}

/** EAN:QTY:SKU — a 12-digit EAN gets its checksum appended; an invalid EAN is
 *  kept (length-capped) so it surfaces in the table as fixable rather than
 *  silently vanishing from a shared link. */
function parseItem(raw: string): Item | null {
  if (!raw) return null
  const [eanRaw = '', qtyRaw = '', ...rest] = raw.split(':')
  const sku = rest.join(':').slice(0, MAX_SKU_LEN)
  const norm = normalizeEan(eanRaw)
  const ean = norm.ok ? norm.ean : eanRaw.slice(0, MAX_EAN_LEN)
  if (!ean && !sku) return null
  const qtyNum = Number.parseInt(qtyRaw, 10)
  const qty = Number.isFinite(qtyNum)
    ? Math.min(BOUNDS.qty.max, Math.max(BOUNDS.qty.min, qtyNum))
    : 1
  return { sku, ean, qty }
}

function parseBool(raw: string | null): boolean | null {
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return null
}
