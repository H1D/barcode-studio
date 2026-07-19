// Tiny DOM helpers. No framework — just terse element construction.

type Attrs = Record<string, string | number | boolean | undefined>

/** Create an element with attributes and children (strings become text nodes). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k === 'text') node.textContent = String(v)
    else if (v === true) node.setAttribute(k, '')
    else node.setAttribute(k, String(v))
  }
  for (const c of children) {
    node.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

/** Query a required element; throws if missing (bug, not runtime input). */
export function must<T extends Element>(root: ParentNode, sel: string): T {
  const found = root.querySelector<T>(sel)
  if (!found) throw new Error(`Missing element: ${sel}`)
  return found
}
