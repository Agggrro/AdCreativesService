import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * A normalized XML tree for rule evaluation.
 *
 * fast-xml-parser's `preserveOrder` output is a nest of one-key objects with
 * attributes hidden under a ":@" sibling key. That shape is fine to produce and
 * miserable to write eighty rules against, so it is converted once, here, into
 * a plain node with the four things every rule wants: name, attributes, text,
 * children — plus the two things that make a finding actionable: an XPath-ish
 * `path` and a best-effort source `line`.
 *
 * Parser settings are load-bearing:
 *   preserveOrder    — <Ad sequence> pods and MediaFile ordering are semantic
 *   parseTagValue    — off, or version="4.2" becomes the number 4.2 and
 *                      <Duration>00:00:30</Duration> stops being a string
 *   ignoreAttributes — off; attributes are most of what VAST validation is
 */

export interface VNode {
  name: string;
  attrs: Record<string, string>;
  children: VNode[];
  /** Direct text and CDATA content, concatenated and trimmed. */
  text: string;
  /** e.g. /VAST/Ad[1]/InLine/Creatives/Creative[1]/Linear */
  path: string;
  /** Best-effort 1-based line of the opening tag in the source. */
  line?: number;
  parent?: VNode;
}

export interface XmlSyntaxError {
  code: string;
  msg: string;
  line: number;
  col: number;
}

export interface ParseResult {
  root?: VNode;
  error?: XmlSyntaxError;
}

const CDATA_KEY = "__cdata";
const TEXT_KEY = "#text";
const ATTR_KEY = ":@";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: CDATA_KEY,
  alwaysCreateTextNode: true,
  processEntities: true,
});

/** One entry of fast-xml-parser's preserveOrder array. */
type FxpEntry = Record<string, unknown>;

/**
 * Blank out comments and CDATA payloads, preserving every byte offset.
 *
 * The line locator scans for literal `<TagName`; a URL inside a CDATA block or
 * a commented-out creative would otherwise pull the cursor forward past real
 * elements and shift every line number after it. Replacing the interiors with
 * spaces keeps offsets exact while making those regions unmatchable.
 */
function maskUnscannable(source: string): string {
  let out = source;
  for (const re of [/<!--[\s\S]*?-->/g, /<!\[CDATA\[[\s\S]*?\]\]>/g]) {
    out = out.replace(re, (match) => " ".repeat(match.length));
  }
  return out;
}

/**
 * Walks the source once, in document order, handing out line numbers.
 *
 * The tree is built in document order too, so a single forward cursor is enough
 * and no element is ever searched for from the top of the file. When a tag
 * cannot be located — malformed input, an element the mask ate — the locator
 * returns undefined rather than guessing, and the finding simply has no line.
 */
class LineLocator {
  private readonly masked: string;
  private readonly lineStarts: number[];
  private cursor = 0;

  constructor(source: string) {
    this.masked = maskUnscannable(source);
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === "\n") this.lineStarts.push(i + 1);
    }
  }

  next(tagName: string): number | undefined {
    const needle = `<${tagName}`;
    let from = this.cursor;
    for (;;) {
      const at = this.masked.indexOf(needle, from);
      if (at === -1) return undefined;
      // Reject a prefix match: <Ad must not satisfy a search for <AdSystem and
      // vice versa. The character after the name has to end the name.
      const after = this.masked[at + needle.length];
      if (after === undefined || /[\s/>]/.test(after)) {
        this.cursor = at + needle.length;
        return this.lineOf(at);
      }
      from = at + 1;
    }
  }

  private lineOf(offset: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }
}

function isElementKey(key: string): boolean {
  // "?xml" and friends are processing instructions, ":@" is the attribute bag,
  // "#text"/"__cdata" are content — none of them are elements.
  return key !== ATTR_KEY && key !== TEXT_KEY && key !== CDATA_KEY && !key.startsWith("?") && !key.startsWith("!");
}

function entryElementKey(entry: FxpEntry): string | undefined {
  return Object.keys(entry).find(isElementKey);
}

function readAttrs(entry: FxpEntry): Record<string, string> {
  const raw = entry[ATTR_KEY];
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value === null || value === undefined ? "" : String(value);
  }
  return out;
}

/** Direct text of a node: bare text plus every CDATA section, in order. */
function readText(children: unknown): string {
  if (!Array.isArray(children)) return "";
  const parts: string[] = [];
  for (const child of children as FxpEntry[]) {
    if (!child || typeof child !== "object") continue;
    if (TEXT_KEY in child) {
      const value = child[TEXT_KEY];
      if (value !== undefined && value !== null) parts.push(String(value));
    } else if (CDATA_KEY in child) {
      parts.push(readText(child[CDATA_KEY]));
    }
  }
  return parts.join("").trim();
}

function build(
  entry: FxpEntry,
  name: string,
  parentPath: string,
  index: number | undefined,
  locator: LineLocator,
  parent?: VNode,
): VNode {
  const step = index === undefined ? name : `${name}[${index}]`;
  const node: VNode = {
    name,
    attrs: readAttrs(entry),
    children: [],
    text: readText(entry[name]),
    path: `${parentPath}/${step}`,
    line: locator.next(name),
    parent,
  };

  const rawChildren = entry[name];
  if (!Array.isArray(rawChildren)) return node;

  // Index only where a name repeats among siblings, so the common case reads as
  // /VAST/Ad/InLine/Creatives rather than /VAST[1]/Ad[1]/InLine[1].
  const counts = new Map<string, number>();
  for (const child of rawChildren as FxpEntry[]) {
    const key = child && typeof child === "object" ? entryElementKey(child) : undefined;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  for (const child of rawChildren as FxpEntry[]) {
    if (!child || typeof child !== "object") continue;
    const key = entryElementKey(child);
    if (!key) continue;
    const total = counts.get(key) ?? 1;
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    node.children.push(
      build(child, key, node.path, total > 1 ? ordinal : undefined, locator, node),
    );
  }

  return node;
}

/**
 * Parse a document into a tree, or report why it is not XML at all.
 *
 * Well-formedness is checked first and separately: `XMLParser` is deliberately
 * lenient and would happily return a partial tree for a truncated document,
 * which is exactly the case a validator must call an error (IAB 100) rather
 * than quietly analyse half a tag.
 */
export function parseXml(source: string): ParseResult {
  const verdict = XMLValidator.validate(source, { allowBooleanAttributes: true });
  if (verdict !== true) {
    const err = verdict.err;
    return {
      error: {
        code: String(err.code ?? "InvalidXml"),
        msg: String(err.msg ?? "Malformed XML."),
        line: Number(err.line ?? 0),
        col: Number(err.col ?? 0),
      },
    };
  }

  let entries: FxpEntry[];
  try {
    entries = parser.parse(source) as FxpEntry[];
  } catch (cause) {
    return {
      error: {
        code: "ParseFailed",
        msg: cause instanceof Error ? cause.message : "The document could not be parsed.",
        line: 0,
        col: 0,
      },
    };
  }

  const locator = new LineLocator(source);
  const rootEntry = entries.find((entry) => entry && typeof entry === "object" && entryElementKey(entry));
  if (!rootEntry) {
    return {
      error: { code: "NoRootElement", msg: "The document has no root element.", line: 0, col: 0 },
    };
  }

  const rootName = entryElementKey(rootEntry) as string;
  return { root: build(rootEntry, rootName, "", undefined, locator) };
}

/* ---------- selectors ---------- */

/** Direct children with this name. */
export function all(node: VNode | undefined, name: string): VNode[] {
  if (!node) return [];
  return node.children.filter((child) => child.name === name);
}

/** First direct child with this name. */
export function first(node: VNode | undefined, name: string): VNode | undefined {
  return node?.children.find((child) => child.name === name);
}

/** Every descendant with this name, in document order. */
export function descendants(node: VNode | undefined, name: string): VNode[] {
  const out: VNode[] = [];
  if (!node) return out;
  const walk = (current: VNode) => {
    for (const child of current.children) {
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** Every descendant, in document order, excluding the node itself. */
export function walkAll(node: VNode | undefined): VNode[] {
  const out: VNode[] = [];
  if (!node) return out;
  const walk = (current: VNode) => {
    for (const child of current.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** An attribute's value, or undefined when absent. Empty string counts as present. */
export function attr(node: VNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return Object.hasOwn(node.attrs, name) ? node.attrs[name] : undefined;
}

