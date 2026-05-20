export type Child = Node | string | number | false | null | undefined;

type EventHandlers = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export interface ElAttrs {
  class?: string;
  id?: string;
  /** Set as textContent (safe — never parsed as HTML). */
  text?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  rows?: string;
  inputmode?: string;
  autocomplete?: string;
  accept?: string;
  href?: string;
  download?: string;
  title?: string;
  disabled?: boolean;
  hidden?: boolean;
  role?: string;
  tabindex?: string;
  dataset?: Record<string, string>;
  aria?: Record<string, string>;
  on?: EventHandlers;
}

const PROP_KEYS = new Set([
  "class",
  "id",
  "text",
  "disabled",
  "hidden",
  "value",
  "dataset",
  "aria",
  "on",
]);

/** Create an element with attributes, dataset, aria, listeners, and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElAttrs = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs.class !== undefined) el.className = attrs.class;
  if (attrs.id !== undefined) el.id = attrs.id;
  if (attrs.text !== undefined) el.textContent = attrs.text;
  if (attrs.disabled === true) el.setAttribute("disabled", "");
  if (attrs.hidden === true) el.hidden = true;

  if (attrs.value !== undefined && "value" in el) {
    (el as unknown as { value: string }).value = attrs.value;
  }

  if (attrs.dataset) {
    for (const [k, v] of Object.entries(attrs.dataset)) el.dataset[k] = v;
  }
  if (attrs.aria) {
    for (const [k, v] of Object.entries(attrs.aria)) el.setAttribute(`aria-${k}`, v);
  }

  // Remaining string attributes map 1:1 to HTML attributes.
  for (const [k, v] of Object.entries(attrs)) {
    if (PROP_KEYS.has(k) || v === undefined) continue;
    el.setAttribute(k, String(v));
  }

  if (attrs.on) {
    for (const [type, handler] of Object.entries(attrs.on)) {
      el.addEventListener(type, handler as EventListener);
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: Child | Child[]): void {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

/** Remove all children from a node. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function qs<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}
