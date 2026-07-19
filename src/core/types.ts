// ─────────────────────────────────────────────────────────────────────────────
// FROZEN INTERFACE CONTRACT — agreed before parallel build. Do NOT change shapes
// without coordinating; UI imports only these types + the functions in index.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** A 13-digit, checksum-valid EAN-13 string. */
export type Ean13 = string

/**
 * A physical label-sheet stock. The tiler reads these fields and NEVER hardcodes
 * a grid — this is what makes edge-to-edge and margined stocks both work.
 */
export interface LabelStock {
  id: string
  name: string
  /** Whether this preset's offsets have been scan-verified on physical stock. */
  verified: boolean
  cols: number
  rows: number
  labelWmm: number
  labelHmm: number
  pageWmm: number
  pageHmm: number
  /** Offset from the page's top-left to the first label's top-left. */
  pageMarginTopmm: number
  pageMarginLeftmm: number
  /** Gap between adjacent labels (0 for edge-to-edge stock). */
  gutterXmm: number
  gutterYmm: number
}

/** User-tunable label styling. Defaults are print-verified on physical stock. */
export interface LabelStyle {
  /** SKU baseline distance from the label's top edge (print-verified: 2.2). */
  skuTopPadMm: number
  /** Digit baseline distance from the label's bottom edge (print-verified: 2.2). */
  digBotPadMm: number
  /** Barcode magnification, 0.80–1.00 (default 1.00; < ~0.90 is scan-risky). */
  magnification: number
  skuFontPt: number
  digitFontPt: number
  showSku: boolean
  showDigits: boolean
}

export interface Item {
  sku: string
  ean: Ean13
  qty: number
}

export type FillMode = 'exact' | 'fillPage'

export interface SheetSpec {
  items: Item[]
  stock: LabelStock
  style: LabelStyle
  fill: FillMode
}

/** Ordered alternating bar/space module widths (in X-modules), starting with the
 * left quiet zone (white). Includes guards + quiet zones. For EAN-13 the drawn
 * symbol (guards+data) is exactly 95 modules; quiet zones are added around it. */
export interface BarModules {
  /** Alternating widths from left: [quietL, bar, space, bar, ...]. First entry is white. */
  modules: number[]
  /** Total modules INCLUDING quiet zones. */
  totalModules: number
  /** The 95 drawn (non-quiet) modules, for assertions/tests. */
  symbolModules: number
}

// ─── The ONLY functions the UI may call (implemented across core/*.ts) ───

/** 12 digits → compute 13th; 13 digits → validate. Returns a branded Ean13 or an error. */
export type NormalizeResult = { ok: true; ean: Ean13 } | { ok: false; error: string }

/** localStorage persistence envelope. Bump `v` on any breaking SheetSpec change. */
export interface PersistedState {
  v: 1
  spec: SheetSpec
}
