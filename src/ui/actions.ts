import type { SheetSpec } from '../core'
import { renderSheet, renderCalibrationSheet } from '../core'
import { el } from './dom'
import { isCalibrated, markCalibrated } from './calibration'

// Print / PDF / calibration actions. All printable output flows through a single
// hidden `.print-area` that holds true-mm SVGs (one wrapper per A4 page). Screen
// chrome is hidden at print time by the print CSS; only `.print-area` is visible.

type PrintKind = 'sheet' | 'calibration'

export class Actions {
  readonly root: HTMLElement
  private readonly printArea: HTMLElement
  private getSpec: () => SheetSpec
  private canPrint: () => boolean
  private printBtn!: HTMLButtonElement
  private pdfBtn!: HTMLButtonElement
  private statusEl!: HTMLElement

  constructor(opts: {
    printArea: HTMLElement
    getSpec: () => SheetSpec
    canPrint: () => boolean
  }) {
    this.printArea = opts.printArea
    this.getSpec = opts.getSpec
    this.canPrint = opts.canPrint
    this.root = el('div', { class: 'actions' })
    this.render()
  }

  /**
   * Enable/disable the print-for-real actions based on validity + guards. When
   * disabled, `reason` is surfaced as a tooltip + aria-disabled so the block is
   * explained rather than silent.
   */
  setEnabled(enabled: boolean, reason = ''): void {
    for (const btn of [this.printBtn, this.pdfBtn]) {
      btn.disabled = !enabled
      if (enabled) {
        btn.removeAttribute('title')
        btn.removeAttribute('aria-disabled')
      } else {
        btn.setAttribute('aria-disabled', 'true')
        if (reason) btn.title = reason
      }
    }
  }

  private render(): void {
    this.pdfBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [
      'Download PDF',
    ]) as HTMLButtonElement
    this.printBtn = el('button', { type: 'button', class: 'btn' }, ['Print']) as HTMLButtonElement
    const calibBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, [
      'Print calibration sheet',
    ]) as HTMLButtonElement
    this.statusEl = el('div', { class: 'action-status', role: 'status' }, [''])

    this.pdfBtn.addEventListener('click', () => void this.downloadPdf())
    this.printBtn.addEventListener('click', () => void this.printSheet())
    calibBtn.addEventListener('click', () => this.printCalibration())

    const calibNote = el('p', { class: 'calib-oneliner' }, [
      'First time on this printer? Print the calibration sheet and check the ruler reads 100 mm before printing labels.',
    ])

    this.root.append(
      calibNote,
      el('div', { class: 'action-row' }, [this.pdfBtn, this.printBtn, calibBtn]),
      this.statusEl,
    )
  }

  private status(msg: string): void {
    this.statusEl.textContent = msg
  }

  // ── Calibration gate ──
  // Returns true if it's safe to proceed with a real print/PDF; otherwise it opens
  // the gate dialog and returns false (the caller aborts; the dialog re-invokes the
  // action on confirm).
  private ensureCalibrated(spec: SheetSpec, then: () => void): boolean {
    if (isCalibrated(spec)) return true
    openCalibrationGate({
      onConfirm: () => {
        markCalibrated(spec)
        then()
      },
      onPrintCalibration: () => this.printCalibration(),
    })
    return false
  }

  private async downloadPdf(): Promise<void> {
    const spec = this.getSpec()
    if (!this.canPrint()) return
    if (!this.ensureCalibrated(spec, () => void this.downloadPdf())) return
    this.pdfBtn.disabled = true
    this.status('Building PDF…')
    try {
      // Lazy-load the PDF engine (jsPDF/svg2pdf) only on first Download so it is
      // code-split out of the initial bundle.
      const { sheetToPdfBlob } = await import('../core/pdf')
      const blob = await sheetToPdfBlob(spec)
      const url = URL.createObjectURL(blob)
      const a = el('a', { href: url, download: 'barcode-sheet.pdf' }) as HTMLAnchorElement
      document.body.append(a)
      a.click()
      a.remove()
      // Revoke after the download has a chance to start.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      this.status('PDF downloaded.')
    } catch (e) {
      this.status(`PDF failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      this.pdfBtn.disabled = false
    }
  }

  private async printSheet(): Promise<void> {
    const spec = this.getSpec()
    if (!this.canPrint()) return
    if (!this.ensureCalibrated(spec, () => void this.printSheet())) return
    try {
      const pages = renderSheet(spec)
      this.fillPrintArea(pages, 'sheet')
      this.doPrint()
      this.status('Sent to printer.')
    } catch (e) {
      this.status(`Print failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  // Calibration sheet is always allowed (that's the whole point — print it FIRST).
  private printCalibration(): void {
    const spec = this.getSpec()
    try {
      const svg = renderCalibrationSheet(spec.stock)
      this.fillPrintArea([svg], 'calibration')
      this.doPrint()
      this.status('Calibration sheet sent to printer — measure the 100 mm ruler.')
    } catch (e) {
      this.status(`Calibration print failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  /** Lay out true-mm SVG page(s) inside the print area, one A4 wrapper each. */
  private fillPrintArea(pages: string[], kind: PrintKind): void {
    this.printArea.innerHTML = ''
    this.printArea.setAttribute('data-kind', kind)
    for (const page of pages) {
      const wrap = el('div', { class: 'print-page' })
      wrap.innerHTML = page
      this.printArea.append(wrap)
    }
  }

  private doPrint(): void {
    // Reflow, then print. Cleared after the dialog closes so screen stays clean.
    const cleanup = () => {
      this.printArea.innerHTML = ''
      this.printArea.removeAttribute('data-kind')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    // Fallback cleanup for browsers that don't fire afterprint.
    setTimeout(cleanup, 1500)
  }
}

// ── Calibration gate dialog (native <dialog>) ──

function openCalibrationGate(opts: {
  onConfirm: () => void
  onPrintCalibration: () => void
}): void {
  const existing = document.querySelector('dialog.calib-gate')
  existing?.remove()

  const confirmBtn = el('button', {
    type: 'button',
    class: 'btn btn-primary',
    disabled: true,
  }) as HTMLButtonElement
  confirmBtn.textContent = 'Confirm — proceed'

  // The ruler-measured checkbox stays locked until the user has actually printed
  // the calibration sheet at least once in this dialog session — you can't confirm
  // a measurement you never printed.
  const chk = el('input', {
    type: 'checkbox',
    class: 'chk',
    disabled: true,
  }) as HTMLInputElement
  chk.addEventListener('change', () => (confirmBtn.disabled = !chk.checked))

  const printCalib = el('button', { type: 'button', class: 'btn btn-ghost' }, [
    'Print calibration sheet',
  ]) as HTMLButtonElement
  const cancel = el('button', { type: 'button', class: 'btn' }, ['Cancel']) as HTMLButtonElement

  const dialog = el('dialog', { class: 'calib-gate' }, [
    el('h2', {}, ['Calibrate before printing']),
    el('p', {}, [
      'Browsers silently rescale prints. Print the calibration sheet and measure its ',
      el('strong', {}, ['100 mm ruler bar']),
      ' with a real ruler. If it is not exactly 100 mm, fix your print settings before printing labels — otherwise no label will register on the die-cut sheet.',
    ]),
    el('label', { class: 'ctl-check gate-ack' }, [
      chk,
      el('span', {}, ['I printed the calibration sheet and the 100 mm ruler measured exactly 100 mm.']),
    ]),
    el('div', { class: 'gate-actions' }, [printCalib, cancel, confirmBtn]),
  ]) as HTMLDialogElement

  const close = () => {
    if (dialog.open) dialog.close()
    dialog.remove()
  }

  printCalib.addEventListener('click', () => {
    // First print unlocks the ruler-measured checkbox for this session.
    chk.disabled = false
    opts.onPrintCalibration()
  })
  cancel.addEventListener('click', () => close())
  confirmBtn.addEventListener('click', () => {
    close()
    opts.onConfirm()
  })

  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

/** Build the on-screen print-settings + media panel (never printed). */
export function buildPrintHelp(): HTMLElement {
  return el('section', { class: 'print-help' }, [
    el('h3', { class: 'ctl-title' }, ['Print settings']),
    el('ul', { class: 'help-list' }, [
      liKV('Chrome / Edge', 'Margins = Default, Scale = 100, uncheck “Fit to page”.'),
      liKV('Firefox', 'Scale = 100 (Ignore scaling).'),
      liKV('Safari', 'Uncheck “Scale to fit”, 100%.'),
    ]),
    el('p', { class: 'help-note' }, [
      'Matte / uncoated stock, black bars only. One visible barcode per unit — cover any other code on the product.',
    ]),
  ])
}

function liKV(k: string, v: string): HTMLElement {
  return el('li', {}, [el('strong', {}, [`${k}: `]), v])
}
