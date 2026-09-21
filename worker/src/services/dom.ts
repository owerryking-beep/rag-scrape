/**
 * Minimal structural types for the DOM surface used by this service.
 *
 * The Workers type environment has no DOM lib, and linkedom's package root
 * only exposes `parseHTML()` typed against its own Window global (its
 * `Document`/`Element`/`Node` exports are value facades, not types). So we
 * define the narrow interface we actually consume and cast the parsed
 * document to it. Structural typing keeps this honest: linkedom's runtime
 * objects provide every member below.
 */

export const NODE_ELEMENT = 1;
export const NODE_TEXT = 3;

export interface DomNode {
  nodeType: number;
  textContent: string | null;
  parentElement: DomElement | null;
  childNodes: ArrayLike<DomNode>;
}

export interface DomElement extends DomNode {
  tagName: string;
  parentElement: DomElement | null;
  children: ArrayLike<DomElement>;
  firstChild: DomNode | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
  insertBefore(node: DomNode, reference: DomNode | null): DomNode;
  appendChild(node: DomNode): DomNode;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
}

export interface DomDocument extends DomElement {
  head: DomElement | null;
  createElement(tagName: string): DomElement;
  createTextNode(text: string): DomNode;
}
