import type { SheetSpec, LabelStyle, FillMode, LabelStock, CustomStockFields } from '../core'
import {
  STOCKS,
  MIN_SAFE_MAGNIFICATION,
  MIN_MAGNIFICATION,
  MAX_MAGNIFICATION,
  CUSTOM_STOCK_ID,
  CUSTOM_BOUNDS,
  MIN_CUSTOM_LABEL_W_MM,
  makeCustomStock,
} from '../core'
import { clone } from './persist'
import { el, must } from './dom'

// Stock / style / fill controls. Renders once; wires change events that mutate a
// working copy of the spec and hand it back through onChange (the app re-renders
// preview + guards). Inputs are uncontrolled (we don't rebuild them per keystroke)
// so caret/focus survive.

export interface ControlsCallbacks {
  onChange: (spec: SheetSpec) => void
}

export class Controls {
  readonly root: HTMLElement
  private spec: SheetSpec
  private readonly cb: ControlsCallbacks
  /** Last valid custom geometry, so preset⇄custom toggling doesn't wipe it. */
  private lastCustom: LabelStock | null

  constructor(spec: SheetSpec, cb: ControlsCallbacks) {
    this.spec = spec
    this.cb = cb
    this.lastCustom = spec.stock.id === CUSTOM_STOCK_ID ? clone(spec.stock) : null
    this.root = el('div', { class: 'controls' })
    this.render()
    this.bind()
  }

  private num(name: string): HTMLInputElement {
    return must<HTMLInputElement>(this.root, `[data-ctl="${name}"]`)
  }

  private emit(): void {
    this.cb.onChange(clone(this.spec))
  }

  private bind(): void {
    // Stock selector.
    this.num('stock').addEventListener('change', (ev) => {
      const id = (ev.target as HTMLSelectElement).value
      if (id === CUSTOM_STOCK_ID) {
        // Seed from the last custom geometry the user built, or — first time —
        // from the stock selected before, so they tweak from a working layout.
        this.prefillCustom(this.lastCustom ?? this.spec.stock)
        this.customFieldset().hidden = false
        this.applyCustom()
        return
      }
      const stock = STOCKS.find((s) => s.id === id)
      if (stock) {
        this.spec.stock = clone(stock)
        this.customFieldset().hidden = true
        this.customError().hidden = true
        this.paintStockBadge()
        this.emit()
      }
    })

    // Custom-stock fields: rebuild + validate on every change; never emit a
    // broken stock.
    for (const f of CUSTOM_FIELDS) {
      this.num(`custom-${f.key}`).addEventListener('input', () => this.applyCustom())
    }

    // Magnification slider + live readout + warning.
    const mag = this.num('magnification')
    mag.addEventListener('input', () => {
      this.spec.style.magnification = clampNum(
        parseFloat(mag.value),
        MIN_MAGNIFICATION,
        MAX_MAGNIFICATION,
        MAX_MAGNIFICATION,
      )
      this.paintMagnification()
      this.emit()
    })

    // Numeric style fields.
    this.bindStyleNumber('skuTopPadMm', 0, 20)
    this.bindStyleNumber('digBotPadMm', 0, 20)
    this.bindStyleNumber('skuFontPt', 4, 24)
    this.bindStyleNumber('digitFontPt', 4, 24)

    // Toggles.
    this.bindToggle('showSku')
    this.bindToggle('showDigits')

    // Fill mode.
    this.root.querySelectorAll<HTMLInputElement>('input[name="fill"]').forEach((r) => {
      r.addEventListener('change', () => {
        if (r.checked) {
          this.spec.fill = r.value as FillMode
          this.emit()
        }
      })
    })
  }

  private bindStyleNumber(field: keyof LabelStyle, lo: number, hi: number): void {
    const input = this.num(field)
    input.addEventListener('input', () => {
      const v = clampNum(parseFloat(input.value), lo, hi, this.spec.style[field] as number)
      ;(this.spec.style[field] as number) = v
      this.emit()
    })
  }

  private bindToggle(field: 'showSku' | 'showDigits'): void {
    const input = this.num(field)
    input.addEventListener('change', () => {
      this.spec.style[field] = input.checked
      this.emit()
    })
  }

  private customFieldset(): HTMLFieldSetElement {
    return must<HTMLFieldSetElement>(this.root, '.custom-stock')
  }

  private customError(): HTMLElement {
    return must<HTMLElement>(this.root, '.custom-error')
  }

  private prefillCustom(stock: LabelStock): void {
    for (const f of CUSTOM_FIELDS) {
      this.num(`custom-${f.key}`).value = String(stock[f.key])
    }
  }

  private readCustomFields(): CustomStockFields {
    const read = (key: keyof CustomStockFields): number =>
      parseFloat(this.num(`custom-${key}`).value)
    return {
      cols: read('cols'),
      rows: read('rows'),
      labelWmm: read('labelWmm'),
      labelHmm: read('labelHmm'),
      pageMarginTopmm: read('pageMarginTopmm'),
      pageMarginLeftmm: read('pageMarginLeftmm'),
      gutterXmm: read('gutterXmm'),
      gutterYmm: read('gutterYmm'),
    }
  }

  private applyCustom(): void {
    const fields = this.readCustomFields()
    const stock = makeCustomStock(fields)
    const err = this.customError()
    if (stock) {
      err.hidden = true
      this.spec.stock = stock
      this.lastCustom = clone(stock)
      this.paintStockBadge()
      this.emit()
    } else {
      err.textContent = customErrorMessage(fields)
      err.hidden = false
    }
  }

  private paintStockBadge(): void {
    const badge = must<HTMLElement>(this.root, '.stock-badge')
    const unverified = !this.spec.stock.verified
    badge.hidden = !unverified
  }

  private paintMagnification(): void {
    const out = must<HTMLElement>(this.root, '.mag-readout')
    out.textContent = `${(this.spec.style.magnification * 100).toFixed(0)}%`
    const warn = must<HTMLElement>(this.root, '.mag-warning')
    warn.hidden = this.spec.style.magnification >= MIN_SAFE_MAGNIFICATION
  }

  private render(): void {
    const s = this.spec.style

    // ── Stock ──
    const stockSelect = el('select', { 'data-ctl': 'stock', class: 'sel' })
    for (const st of STOCKS) {
      const opt = el('option', { value: st.id }, [st.name])
      ;(opt as HTMLOptionElement).selected = st.id === this.spec.stock.id
      stockSelect.append(opt)
    }
    const customOpt = el('option', { value: CUSTOM_STOCK_ID }, ['Custom size…'])
    customOpt.selected = this.spec.stock.id === CUSTOM_STOCK_ID
    stockSelect.append(customOpt)

    const stockBadge = el('span', { class: 'stock-badge badge-warn' }, [
      '⚠ UNVERIFIED — test on real stock before trusting',
    ])
    ;(stockBadge as HTMLElement).hidden = this.spec.stock.verified

    // Custom-stock fieldset: hidden unless 'Custom size…' is selected; prefilled
    // from the current stock's geometry (incl. a restored custom stock).
    const customFieldset = el('fieldset', { class: 'custom-stock' })
    for (const f of CUSTOM_FIELDS) {
      const b = CUSTOM_BOUNDS[f.key]
      // Align the min attribute to the step grid (the raw bound can be an
      // unround float like the EAN-13 min width), so preset values aren't
      // flagged step-mismatched and spinner arrows produce clean values.
      const min = Math.ceil(b.min / f.step) * f.step
      customFieldset.append(
        field(f.label, numInput(`custom-${f.key}`, this.spec.stock[f.key], min, b.max, f.step)),
      )
    }
    const customError = el('div', { class: 'custom-error badge-danger' })
    customError.hidden = true
    customFieldset.append(customError)
    customFieldset.hidden = this.spec.stock.id !== CUSTOM_STOCK_ID

    const stockGroup = group('Label stock', [
      field('', stockSelect),
      el('div', { class: 'badge-row' }, [stockBadge]),
      customFieldset,
    ])

    // ── Magnification ──
    const mag = el('input', {
      type: 'range',
      'data-ctl': 'magnification',
      min: MIN_MAGNIFICATION,
      max: MAX_MAGNIFICATION,
      step: 0.01,
      class: 'slider',
    })
    ;(mag as HTMLInputElement).value = String(s.magnification)
    const magReadout = el('span', { class: 'mag-readout' }, [`${(s.magnification * 100).toFixed(0)}%`])
    const magWarn = el('div', { class: 'mag-warning badge-danger' }, [
      'Too small — the barcode may not scan reliably on a laser printer.',
    ])
    ;(magWarn as HTMLElement).hidden = s.magnification >= MIN_SAFE_MAGNIFICATION

    const magGroup = group('Magnification', [
      el('div', { class: 'mag-row' }, [mag, magReadout]),
      magWarn,
    ])

    // ── Style ──
    const styleGroup = group('Text & layout', [
      field('SKU top pad (mm)', numInput('skuTopPadMm', s.skuTopPadMm, 0, 20, 0.1)),
      field('Digit bottom pad (mm)', numInput('digBotPadMm', s.digBotPadMm, 0, 20, 0.1)),
      field('SKU font (pt)', numInput('skuFontPt', s.skuFontPt, 4, 24, 0.5)),
      field('Digit font (pt)', numInput('digitFontPt', s.digitFontPt, 4, 24, 0.5)),
      checkbox('showSku', 'Show SKU', s.showSku),
      checkbox('showDigits', 'Show human-readable digits', s.showDigits),
    ])

    // ── Fill mode ──
    const fillGroup = group('Fill', [
      radio(
        'fill',
        'exact',
        'Print exactly the counts I set (uses Qty)',
        this.spec.fill === 'exact',
      ),
      radio(
        'fill',
        'fillPage',
        'Fill the whole sheet with one code (ignores Qty)',
        this.spec.fill === 'fillPage',
      ),
    ])

    this.root.append(stockGroup, magGroup, styleGroup, fillGroup)
  }
}

// ─── custom stock ───

/** Input order + labels for the custom-stock fieldset. Keys match CustomStockFields. */
const CUSTOM_FIELDS: Array<{ key: keyof CustomStockFields; label: string; step: number }> = [
  { key: 'cols', label: 'Columns', step: 1 },
  { key: 'rows', label: 'Rows', step: 1 },
  { key: 'labelWmm', label: 'Label width (mm)', step: 0.1 },
  { key: 'labelHmm', label: 'Label height (mm)', step: 0.1 },
  { key: 'pageMarginTopmm', label: 'Top margin (mm)', step: 0.1 },
  { key: 'pageMarginLeftmm', label: 'Left margin (mm)', step: 0.1 },
  { key: 'gutterXmm', label: 'Horizontal gutter (mm)', step: 0.1 },
  { key: 'gutterYmm', label: 'Vertical gutter (mm)', step: 0.1 },
]

/** Human-readable reason for makeCustomStock rejecting these fields. */
function customErrorMessage(f: CustomStockFields): string {
  for (const { key } of CUSTOM_FIELDS) {
    if (!Number.isFinite(f[key])) return 'Fill in every field with a number.'
  }
  if (!Number.isInteger(f.cols) || !Number.isInteger(f.rows)) {
    return 'Columns and rows must be whole numbers.'
  }
  if (f.labelWmm < MIN_CUSTOM_LABEL_W_MM) {
    return `Label too narrow for an EAN-13 barcode — min ≈${Math.ceil(MIN_CUSTOM_LABEL_W_MM)} mm.`
  }
  const eps = 1e-6
  const fitsX = f.pageMarginLeftmm + f.cols * f.labelWmm + (f.cols - 1) * f.gutterXmm <= 210 + eps
  const fitsY = f.pageMarginTopmm + f.rows * f.labelHmm + (f.rows - 1) * f.gutterYmm <= 297 + eps
  if (!fitsX || !fitsY) return "Grid doesn't fit the page (210 × 297 mm)."
  return 'One or more values are out of range.'
}

// ─── small builders ───

function group(title: string, children: Array<Node | string>): HTMLElement {
  return el('section', { class: 'ctl-group' }, [
    el('h3', { class: 'ctl-title' }, [title]),
    ...children,
  ])
}

function field(label: string, control: Node): HTMLElement {
  const children: Array<Node | string> = []
  if (label) children.push(el('span', { class: 'ctl-label' }, [label]))
  children.push(control)
  return el('label', { class: 'ctl-field' }, children)
}

function numInput(
  name: string,
  value: number,
  min: number,
  max: number,
  step: number,
): HTMLInputElement {
  const input = el('input', {
    type: 'number',
    'data-ctl': name,
    min,
    max,
    step,
    class: 'num',
  }) as HTMLInputElement
  input.value = String(value)
  return input
}

function checkbox(name: string, label: string, checked: boolean): HTMLElement {
  const input = el('input', { type: 'checkbox', 'data-ctl': name, class: 'chk' }) as HTMLInputElement
  input.checked = checked
  return el('label', { class: 'ctl-check' }, [input, el('span', {}, [label])])
}

function radio(name: string, value: string, label: string, checked: boolean): HTMLElement {
  const input = el('input', { type: 'radio', name, value, class: 'rad' }) as HTMLInputElement
  input.checked = checked
  return el('label', { class: 'ctl-check' }, [input, el('span', {}, [label])])
}

function clampNum(v: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, v))
}
