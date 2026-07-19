import type { SheetSpec } from '../core'

// The calibration gate. Before the first real print/PDF-for-print on a device the
// user must confirm the printed 100 mm ruler measured exactly 100 mm. The ack is
// keyed to (stock id + magnification) — change either and the gate re-triggers,
// because a rescale would put every label off-register.

const KEY = 'barcode-studio:calibrated'

/** Stable signature of the print-fidelity-relevant settings. */
export function calibrationSig(spec: SheetSpec): string {
  return `${spec.stock.id}@${spec.style.magnification.toFixed(2)}`
}

/** True when the current stock+magnification has a stored calibration ack. */
export function isCalibrated(spec: SheetSpec): boolean {
  try {
    return localStorage.getItem(KEY) === calibrationSig(spec)
  } catch {
    return false
  }
}

/** Record that the user confirmed the ruler measured 100 mm for this signature. */
export function markCalibrated(spec: SheetSpec): void {
  try {
    localStorage.setItem(KEY, calibrationSig(spec))
  } catch {
    /* storage unavailable — gate will simply re-ask next time */
  }
}
