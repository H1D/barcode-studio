import type { Item } from '../core'
import { normalizeEan } from '../core'
import { el, must } from './dom'

// Editable multi-row item table (SKU, EAN, qty). Imperative + event delegation:
// the rest of the app is full-redraw, but a live-editing table with focus/caret
// state must not be blown away on every keystroke.

export interface ItemRow {
  /** Raw text the user typed for the EAN (may be 12 or 13 digits, spaces, etc). */
  eanInput: string
  sku: string
  qty: number
  /** Normalized 13-digit EAN when valid, else null. */
  normalized: string | null
  error: string | null
}

export interface ItemTableCallbacks {
  onChange: (rows: ItemRow[]) => void
}

/** Per-row quantity bounds. Upper bound keeps expanded label counts sane. */
export const QTY_MIN = 1
export const QTY_MAX = 2000

function clampQty(n: number): number {
  if (!Number.isFinite(n)) return QTY_MIN
  return Math.min(QTY_MAX, Math.max(QTY_MIN, Math.floor(n)))
}

/** Seed editing rows from persisted items (their EANs are already normalized). */
export function rowsFromItems(items: Item[]): ItemRow[] {
  const rows = items.map<ItemRow>((it) => {
    const res = normalizeEan(it.ean)
    return {
      eanInput: it.ean,
      sku: it.sku,
      qty: it.qty,
      normalized: res.ok ? res.ean : null,
      error: res.ok ? null : res.error,
    }
  })
  return rows.length ? rows : [emptyRow()]
}

/** Convert valid rows into Items for the spec (invalid rows are dropped). */
export function rowsToItems(rows: ItemRow[]): Item[] {
  return rows
    .filter((r) => r.normalized !== null)
    .map((r) => ({ sku: r.sku.trim(), ean: r.normalized as string, qty: r.qty }))
}

export function allRowsValid(rows: ItemRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.normalized !== null)
}

function emptyRow(): ItemRow {
  return { eanInput: '', sku: '', qty: 1, normalized: null, error: 'EAN required' }
}

function revalidate(row: ItemRow): void {
  const raw = row.eanInput.trim()
  if (raw === '') {
    row.normalized = null
    row.error = 'EAN required'
    return
  }
  const res = normalizeEan(raw)
  if (res.ok) {
    row.normalized = res.ean
    row.error = null
  } else {
    row.normalized = null
    row.error = res.error
  }
}

export class ItemTable {
  readonly root: HTMLElement
  private rows: ItemRow[]
  private readonly cb: ItemTableCallbacks
  /** When set, Qty inputs are disabled and this hint is shown next to them. */
  private qtyDisabledHint: string | null = null

  constructor(rows: ItemRow[], cb: ItemTableCallbacks) {
    this.rows = rows.length ? rows : [emptyRow()]
    this.cb = cb
    this.root = el('div', { class: 'item-table' })
    this.bind()
    this.render()
  }

  /**
   * Disable/enable the Qty inputs. Passing a hint disables them and shows it
   * (used when the fill mode makes per-row quantities irrelevant).
   */
  setQtyDisabled(hint: string | null): void {
    if (this.qtyDisabledHint === hint) return
    this.qtyDisabledHint = hint
    this.render()
  }

  private bind(): void {
    // Input delegation for text/number edits.
    this.root.addEventListener('input', (ev) => {
      const t = ev.target as HTMLElement
      const idx = this.rowIndexOf(t)
      if (idx < 0) return
      const row = this.rows[idx]
      const field = t.getAttribute('data-field')
      if (field === 'sku') {
        row.sku = (t as HTMLInputElement).value
      } else if (field === 'ean') {
        row.eanInput = (t as HTMLInputElement).value
        revalidate(row)
        this.paintRowStatus(idx)
      } else if (field === 'qty') {
        const n = parseInt((t as HTMLInputElement).value, 10)
        row.qty = clampQty(n)
      }
      this.cb.onChange(this.rows)
    })

    // Click delegation for add/remove buttons.
    this.root.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-action]')
      if (!btn) return
      const action = btn.getAttribute('data-action')
      if (action === 'add') {
        this.rows.push(emptyRow())
        this.render()
        this.cb.onChange(this.rows)
        this.focusLastRow()
      } else if (action === 'remove') {
        const idx = this.rowIndexOf(btn as HTMLElement)
        if (idx >= 0 && this.rows.length > 1) {
          this.rows.splice(idx, 1)
          this.render()
          this.cb.onChange(this.rows)
        }
      }
    })
  }

  private rowIndexOf(node: HTMLElement): number {
    const tr = node.closest('[data-row]')
    if (!tr) return -1
    return Number(tr.getAttribute('data-row'))
  }

  /** Update only the EAN validity indicators for one row (keeps focus/caret). */
  private paintRowStatus(idx: number): void {
    const rowEl = this.root.querySelector<HTMLElement>(`[data-row="${idx}"]`)
    if (!rowEl) return
    const row = this.rows[idx]
    const eanInput = must<HTMLInputElement>(rowEl, '[data-field="ean"]')
    const err = must<HTMLElement>(rowEl, '.row-error')
    const ok = row.normalized !== null
    eanInput.classList.toggle('invalid', !ok)
    eanInput.setAttribute('aria-invalid', ok ? 'false' : 'true')
    err.textContent = ok ? '' : row.error ?? ''
    err.hidden = ok
  }

  private focusLastRow(): void {
    const rowEl = this.root.querySelector<HTMLElement>(`[data-row="${this.rows.length - 1}"]`)
    rowEl?.querySelector<HTMLInputElement>('[data-field="sku"]')?.focus()
  }

  private render(): void {
    this.root.textContent = ''

    const head = el('div', { class: 'it-head' }, [
      el('span', { class: 'it-col-sku' }, ['SKU']),
      el('span', { class: 'it-col-ean' }, ['EAN (12 or 13 digits)']),
      el('span', { class: 'it-col-qty' }, ['Qty']),
      el('span', { class: 'it-col-act' }, ['']),
    ])
    this.root.append(head)

    this.rows.forEach((row, idx) => {
      const ok = row.normalized !== null
      const skuInput = el('input', {
        type: 'text',
        'data-field': 'sku',
        class: 'it-sku',
        value: row.sku,
        placeholder: 'SKU',
        maxlength: 40,
      })
      ;(skuInput as HTMLInputElement).value = row.sku

      const eanInput = el('input', {
        type: 'text',
        inputmode: 'numeric',
        'data-field': 'ean',
        class: ok ? 'it-ean' : 'it-ean invalid',
        placeholder: 'e.g. 5901234123457',
        'aria-invalid': ok ? 'false' : 'true',
      })
      ;(eanInput as HTMLInputElement).value = row.eanInput

      const qtyDisabled = this.qtyDisabledHint !== null
      const qtyInput = el('input', {
        type: 'number',
        'data-field': 'qty',
        class: 'it-qty',
        min: QTY_MIN,
        max: QTY_MAX,
        step: 1,
        disabled: qtyDisabled,
      })
      ;(qtyInput as HTMLInputElement).value = String(row.qty)

      const removeBtn = el(
        'button',
        {
          type: 'button',
          'data-action': 'remove',
          class: 'btn-icon',
          title: 'Remove row',
          disabled: this.rows.length <= 1,
        },
        ['×'],
      )

      const errEl = el('span', { class: 'row-error' }, [ok ? '' : row.error ?? ''])
      ;(errEl as HTMLElement).hidden = ok

      const rowEl = el('div', { class: 'it-row', 'data-row': idx }, [
        skuInput,
        el('div', { class: 'it-ean-wrap' }, [eanInput, errEl]),
        qtyInput,
        removeBtn,
      ])
      this.root.append(rowEl)
    })

    if (this.qtyDisabledHint) {
      this.root.append(el('div', { class: 'qty-hint' }, [this.qtyDisabledHint]))
    }

    const addBtn = el('button', { type: 'button', 'data-action': 'add', class: 'btn-add' }, [
      '+ Add row',
    ])
    this.root.append(addBtn)
  }
}
