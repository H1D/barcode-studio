import type { SheetSpec } from '../core'
import { el } from './dom'
import { loadSpec, saveSpec, clone } from './persist'
import { applySearchToSpec, specToSearch } from './urlSync'
import { ItemTable, rowsFromItems, rowsToItems, allRowsValid, type ItemRow } from './itemTable'
import { Controls } from './controls'
import { Preview } from './preview'
import { Actions, buildPrintHelp } from './actions'
import { computeGuards, isPrintSafe, expandedLabelCount, MAX_LABELS, type Guard } from './guards'

// App shell. Owns the single source of truth `state: SheetSpec`. Any control change
// mutates `state`, persists it, recomputes guards, and re-renders the preview
// (full redraw of the SVG from core). The item table keeps its own editing rows;
// only its *valid* rows are projected into `state.items`.

export function mountApp(root: HTMLElement): void {
  const state: SheetSpec = loadSpec()
  // Query params override the restored spec field-by-field, so a shared link
  // opens with the sender's setup regardless of this browser's saved state.
  applySearchToSpec(state, window.location.search)

  root.textContent = ''
  root.append(buildHeader())

  const layout = el('div', { class: 'layout' })
  const left = el('div', { class: 'col-left' })
  const right = el('div', { class: 'col-right' })
  layout.append(left, right)
  root.append(layout)

  // Hidden print target (true-mm SVGs go here at print time).
  const printArea = el('div', { class: 'print-area', 'aria-hidden': 'true' })
  root.append(printArea)

  // ── Item table ──
  let rows: ItemRow[] = rowsFromItems(state.items)
  const table = new ItemTable(rows, {
    onChange: (r) => {
      rows = r
      state.items = rowsToItems(rows)
      syncQtyEnabled()
      onStateChanged()
    },
  })

  // ── Controls ──
  const controls = new Controls(state, {
    onChange: (next) => {
      state.stock = next.stock
      state.style = next.style
      state.fill = next.fill
      syncQtyEnabled()
      onStateChanged()
    },
  })

  // ── Preview ──
  const preview = new Preview()

  // ── Guards panel ──
  const guardsPanel = el('div', { class: 'guards' })

  // ── Actions ──
  const actions = new Actions({
    printArea,
    getSpec: () => clone(state),
    canPrint: () => canPrintNow(),
  })

  // Assemble.
  const itemsSection = section('Items', table.root)
  itemsSection.insertBefore(buildItemsIntro(), table.root)
  left.append(
    itemsSection,
    controls.root,
    buildPrintHelp(),
  )
  right.append(preview.root, guardsPanel, actions.root)

  // Reflect the fill mode onto the Qty inputs: in fill-the-sheet mode the qty is
  // ignored, so the inputs are locked with an explanatory hint.
  function syncQtyEnabled(): void {
    if (state.fill === 'fillPage') {
      const hint =
        rows.length > 1
          ? 'Qty ignored — fill mode repeats each code across the sheet in order.'
          : 'Qty ignored — fills the sheet.'
      table.setQtyDisabled(hint)
    } else {
      table.setQtyDisabled(null)
    }
  }

  function canPrintNow(): boolean {
    return allRowsValid(rows) && state.items.length > 0 && isPrintSafe(computeGuards(state))
  }

  function disabledReason(): string {
    if (!allRowsValid(rows) || state.items.length === 0) return 'Fix invalid EAN(s) first'
    if (expandedLabelCount(state) > MAX_LABELS) return 'Too many labels — reduce quantities'
    return ''
  }

  // Mirror the spec into the address bar (replaceState — no history spam) so
  // the URL is always a shareable deep link. Only non-default fields are
  // written; foreign params (utm_* etc.) are preserved. Best-effort: some
  // embeds (sandboxed iframes, file://) refuse replaceState.
  function syncUrl(): void {
    try {
      const qs = specToSearch(state, window.location.search)
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      history.replaceState(history.state, '', url)
    } catch {
      /* URL sync unavailable — keep running */
    }
  }

  function onStateChanged(): void {
    // Project current valid rows into state before rendering.
    state.items = rowsToItems(rows)
    saveSpec(state)
    syncUrl()
    preview.update(state)
    const guards = computeGuards(state)
    renderGuards(guardsPanel, guards, rows)
    const ok = canPrintNow()
    actions.setEnabled(ok, ok ? '' : disabledReason())
  }

  // Initial paint.
  syncQtyEnabled()
  onStateChanged()
}

/** First-run explainer above the item table (K). */
function buildItemsIntro(): HTMLElement {
  return el('p', { class: 'items-intro' }, [
    'Enter your product code (SKU) and its barcode number (EAN). The row below is an example — replace it.',
  ])
}

function canRowsBlock(rows: ItemRow[]): boolean {
  return !allRowsValid(rows)
}

function renderGuards(panel: HTMLElement, guards: Guard[], rows: ItemRow[]): void {
  panel.textContent = ''
  const msgs: Array<{ severity: 'warn' | 'block'; text: string }> = []

  if (canRowsBlock(rows)) {
    msgs.push({
      severity: 'block',
      text: 'One or more EANs are invalid — fix them to enable Print and Download.',
    })
  }
  for (const g of guards) msgs.push({ severity: g.severity, text: g.message })

  if (msgs.length === 0) {
    panel.append(el('div', { class: 'guard guard-ok' }, ['Ready to print.']))
    return
  }

  for (const m of msgs) {
    panel.append(
      el('div', { class: `guard guard-${m.severity}` }, [
        el('span', { class: 'guard-tag' }, [m.severity === 'block' ? 'BLOCKED' : 'WARNING']),
        el('span', {}, [m.text]),
      ]),
    )
  }
}

function buildHeader(): HTMLElement {
  return el('header', { class: 'app-header' }, [
    el('div', { class: 'app-title' }, ['Barcode Studio']),
    // h1 so the rendered DOM keeps an indexable heading matching the page
    // title after the static #app content is replaced on mount.
    el('h1', { class: 'app-sub' }, ['EAN-13 barcode label sheet generator']),
  ])
}

function section(title: string, body: Node): HTMLElement {
  return el('section', { class: 'panel' }, [el('h3', { class: 'ctl-title' }, [title]), body])
}
