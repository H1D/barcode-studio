import { jsPDF } from 'jspdf'
// Side-effect import: registers `doc.svg()` on the jsPDF prototype. Without it,
// `doc.svg` is undefined. Do NOT change to a symbol import.
import 'svg2pdf.js'
import type { SheetSpec } from './types'
import { renderSheet } from './svg'

// svg2pdf.js augments the jsPDF prototype with `.svg()` at runtime but ships no
// type for it. Declare it here so the call below is type-checked, not asserted.
declare module 'jspdf' {
  interface jsPDF {
    svg(
      element: Element,
      options?: { x?: number; y?: number; width?: number; height?: number },
    ): Promise<jsPDF>
  }
}

// A4 in mm.
const A4_W_MM = 210
const A4_H_MM = 297

/**
 * Render the spec to a deterministic vector A4 PDF Blob. This is the primary,
 * reproducible artifact — the browser Print path is only a convenience.
 *
 * Each page SVG (already sized in mm with a matching viewBox) is drawn 1:1 into
 * the PDF, so geometry is exact and does not depend on the print dialog.
 */
export async function sheetToPdfBlob(spec: SheetSpec): Promise<Blob> {
  const pages = renderSheet(spec)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage()
    const el = new DOMParser().parseFromString(pages[i], 'image/svg+xml').documentElement
    // doc.svg() is async — must await before output.
    await doc.svg(el, {
      x: 0,
      y: 0,
      width: A4_W_MM,
      height: A4_H_MM,
    })
  }

  return doc.output('blob')
}
