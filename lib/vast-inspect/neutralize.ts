import { signHopToken } from "./hop-token";

/**
 * Dry-run rewriting.
 *
 * A validator that plays a real tag fires that tag's real pixels. On a public
 * tool that means inflating a stranger's impression counts and spending their
 * budget, so dry-run is the default and it has to be airtight.
 *
 * Intercepting the player's network calls is not possible — Google IMA issues
 * them from its own cross-origin bridge frame, which nothing on the page can
 * reach. So we do not intercept; we substitute the document. Every tracking URL
 * becomes a request to our own 204 endpoint, and every <VASTAdTagURI> becomes a
 * request to our hop proxy, which fetches the real next hop and neutralizes it
 * the same way before handing it back.
 *
 * The chain therefore keeps its exact shape — same number of hops, same order,
 * same wrapper semantics — while nothing leaves for a third party. That
 * fidelity is why this rewrites the raw source rather than re-serialising the
 * parsed tree: comments, namespaces, entity choices and CDATA boundaries all
 * survive untouched, so the player parses something as close to the original as
 * it can be while still being safe.
 *
 * ClickThrough is deliberately NOT rewritten. It is a landing page opened on a
 * deliberate user click, not a pixel that fires on its own, and checking that
 * the advertiser's page actually loads is part of what the tool is for.
 * ClickTracking, which does fire automatically, is rewritten like everything
 * else.
 */

/**
 * Every element whose text content a player will request without being asked.
 *
 * Wider than the inventory in trackers.ts, and deliberately so. That list
 * answers "who is measuring this impression"; this one answers "what would
 * leave our network", and the two differ over verification resources:
 * JavaScriptResource is not a pixel, but loading it executes a measurement
 * vendor's code, which beacons on its own and bills per measured impression.
 * Suppressing it costs the ability to prove the script loads — which is what
 * the live toggle is for — and that is the cheaper of the two mistakes.
 *
 * What is NOT here is as considered as what is. MediaFile, Mezzanine,
 * InteractiveCreativeFile and ClickThrough all stay intact: they are what the
 * ad is, not what counts it, and the whole point of playing the tag is to find
 * out whether they work. The same reasoning keeps StaticResource, IFrameResource
 * and HTMLResource out: those are a companion or non-linear creative's actual
 * content, so suppressing them would mean the validator could never render a
 * companion at all. The cost is real and worth naming — an IFrameResource loads
 * a third-party document that may beacon on its own — but it is the same cost
 * we already accept for MediaFile, and the live toggle is the honest answer to
 * anyone who needs the difference measured.
 */
const NEUTRALIZED_ELEMENTS = [
  "Impression",
  "Tracking",
  "ClickTracking",
  "CustomClick",
  "Error",
  "Viewable",
  "NotViewable",
  "ViewUndetermined",
  "CompanionClickTracking",
  "NonLinearClickTracking",
  "IconViewTracking",
  "IconClickTracking",
  "JavaScriptResource",
  "ExecutableResource",
  // Fetched by the player without any interaction, and carries no creative.
  "Survey",
] as const;

export interface NeutralizeOptions {
  /** Absolute origin of this deployment, e.g. https://example.vercel.app */
  origin: string;
}

function voidUrl(origin: string, element: string, event: string | undefined): string {
  const params = new URLSearchParams({ e: event ? `${element}:${event}` : element });
  return `${origin}/api/tools/vast/void?${params.toString()}`;
}

/** `(?:^|\s)` so a lookup for `event` cannot be satisfied by `data-event`. */
function readAttr(attrs: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  ).exec(attrs);
  if (!match) return undefined;
  return match[1] ?? match[2];
}

/**
 * The text a player would see for an element, whether it was authored as CDATA
 * or as escaped text. Only the five predefined XML entities are handled, which
 * is all a URL can legally contain.
 */
function elementText(inner: string): string {
  const withoutCdata = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return withoutCdata
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Blank out comments and CDATA payloads, preserving every byte offset.
 *
 * Used only to decide where a *tag* may legitimately start or end. An element
 * name occurring inside a CDATA payload — `<![CDATA[<Impression>x</Impression>]]>`
 * inside an `<Extension>`, which is entirely legal — must not be mistaken for
 * markup, or the rewrite injects a `]]>` that terminates the enclosing CDATA
 * early and turns a valid document into IAB error 100.
 *
 * The CDATA that forms an element's own content is unaffected: the opening tag
 * is found outside it, and the whole inner range is then replaced wholesale.
 */
function maskUnscannable(source: string): string {
  let out = source;
  for (const re of [/<!--[\s\S]*?-->/g, /<!\[CDATA\[[\s\S]*?\]\]>/g]) {
    out = out.replace(re, (match) => " ".repeat(match.length));
  }
  return out;
}

/**
 * Find where a start tag's `>` is, respecting quoted attribute values.
 *
 * `>` needs no escaping inside an XML attribute value, so `<Impression id="a>b">`
 * is well-formed and a `[^>]*` scan would stop in the wrong place.
 * Returns the index of the closing `>`, or -1.
 */
function endOfStartTag(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

/**
 * Replace the content of every occurrence of one element type.
 *
 * Deliberately a scan rather than a single regex. The regex version shipped a
 * hole that broke the dry-run guarantee outright: for a self-closing
 * `<Impression/>` the non-greedy body still ran forward to the *next*
 * `</Impression>`, the guard returned the span untouched, and the global cursor
 * jumped past it — so a real tracker sitting between an empty placeholder and
 * the next close tag was never neutralized and fired for real. Empty
 * placeholders are common enough that there is a rule about them
 * (`VAST-empty-url-element`), which is exactly why this mattered.
 *
 * Attributes pass through verbatim — losing `event="firstQuartile"` would change
 * which events the player reports, which is the one thing dry-run must not do.
 */
function rewriteElement(
  source: string,
  element: string,
  rewrite: (attrs: string, text: string) => string | undefined,
): string {
  const masked = maskUnscannable(source);
  const open = `<${element}`;
  const close = `</${element}`;

  let out = "";
  let cursor = 0;

  for (;;) {
    const start = masked.indexOf(open, cursor);
    if (start === -1) break;

    // Reject a prefix match: <Tracking must not satisfy <TrackingEvents.
    const after = masked[start + open.length];
    if (after === undefined || !/[\s/>]/.test(after)) {
      out += source.slice(cursor, start + open.length);
      cursor = start + open.length;
      continue;
    }

    const tagEnd = endOfStartTag(source, start + open.length);
    if (tagEnd === -1) break;

    const attrs = source.slice(start + open.length, tagEnd);

    // Self-closing: no content, nothing to suppress. Advance past just this
    // tag — never past the span that follows it.
    if (attrs.trimEnd().endsWith("/")) {
      out += source.slice(cursor, tagEnd + 1);
      cursor = tagEnd + 1;
      continue;
    }

    const closeStart = masked.indexOf(close, tagEnd + 1);
    if (closeStart === -1) break;
    const closeEnd = endOfStartTag(source, closeStart + close.length);
    if (closeEnd === -1) break;

    const inner = source.slice(tagEnd + 1, closeStart);
    const replacement = rewrite(attrs, elementText(inner));

    out += source.slice(cursor, start);
    out +=
      replacement === undefined
        ? source.slice(start, closeEnd + 1)
        : `<${element}${attrs}><![CDATA[${replacement}]]></${element}>`;
    cursor = closeEnd + 1;
  }

  return out + source.slice(cursor);
}

/**
 * Rewrite one VAST document so it is safe to hand to a player.
 *
 * A document that is not well-formed comes back unchanged: repairing it is the
 * analyser's business to report on, not this function's to attempt.
 */
export function neutralizeDocument(source: string, options: NeutralizeOptions): string {
  const origin = options.origin.replace(/\/+$/, "");
  let out = source;

  for (const element of NEUTRALIZED_ELEMENTS) {
    out = rewriteElement(out, element, (attrs, text) =>
      // An empty element has no pixel to suppress; leaving it byte-identical
      // keeps the diff between original and neutralized as small as possible.
      text === ""
        ? undefined
        : voidUrl(origin, element, element === "Tracking" ? readAttr(attrs, "event") : undefined),
    );
  }

  // Wrapper hops travel through our proxy so the next document is neutralized
  // in turn. A URI we cannot sign — relative, or a scheme we do not fetch — is
  // left alone: the chain then fails exactly where the report says it will.
  out = rewriteElement(out, "VASTAdTagURI", (_attrs, text) => {
    if (!text) return undefined;
    try {
      return `${origin}/api/tools/vast/hop?t=${signHopToken(text)}`;
    } catch {
      return undefined;
    }
  });

  return out;
}
