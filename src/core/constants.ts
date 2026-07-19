// ─────────────────────────────────────────────────────────────────────────────
// Shared EAN-13 barcode geometry constants. Defined ONCE here and imported by
// the core renderer/encoder AND the UI (re-exported from ./index) so the X-
// dimension and module-count magic numbers live in a single place.
// ─────────────────────────────────────────────────────────────────────────────

/** Nominal EAN-13 X-dimension (mm) at 100% magnification. */
export const NOMINAL_X_MM = 0.33

/** Modules in the drawn symbol (guards + 12 digits), excluding quiet zones. */
export const SYMBOL_MODULES = 95

/** Left quiet-zone width in X-modules. */
export const QUIET_LEFT_MODULES = 11

/** Right quiet-zone width in X-modules. */
export const QUIET_RIGHT_MODULES = 7

/** Full block width in X-modules: symbol + both quiet zones (95 + 11 + 7). */
export const BLOCK_MODULES = SYMBOL_MODULES + QUIET_LEFT_MODULES + QUIET_RIGHT_MODULES

/** Lowest magnification the app allows (GS1 floor is 0.80). */
export const MIN_MAGNIFICATION = 0.8

/** Highest magnification the app allows (nominal size). */
export const MAX_MAGNIFICATION = 1.0
