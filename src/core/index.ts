// Public core API surface. The UI imports ONLY from here (+ ./types).
export type {
  Ean13,
  LabelStock,
  LabelStyle,
  Item,
  FillMode,
  SheetSpec,
  BarModules,
  NormalizeResult,
  PersistedState,
} from './types'

export {
  A4_40,
  AVERY_L7160,
  AVERY_L7159,
  AVERY_3475,
  STOCKS,
  DEFAULT_STYLE,
  DEFAULT_SPEC,
  MIN_SAFE_MAGNIFICATION,
} from './presets'

export {
  CUSTOM_STOCK_ID,
  MIN_CUSTOM_LABEL_W_MM,
  CUSTOM_BOUNDS,
  makeCustomStock,
} from './customStock'
export type { CustomStockFields } from './customStock'

export {
  NOMINAL_X_MM,
  SYMBOL_MODULES,
  QUIET_LEFT_MODULES,
  QUIET_RIGHT_MODULES,
  BLOCK_MODULES,
  MIN_MAGNIFICATION,
  MAX_MAGNIFICATION,
} from './constants'

export { normalizeEan, encodeEan13 } from './ean13'
export { renderLabelSvg, renderSheet } from './svg'
export { renderCalibrationSheet } from './svg'
// NOTE: sheetToPdfBlob is intentionally NOT re-exported here. It pulls in jsPDF
// (~160 KB), so the UI lazy-loads it via `await import('./core/pdf')` on the
// Download-PDF click, keeping the PDF engine out of the initial bundle.
