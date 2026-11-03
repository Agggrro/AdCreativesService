// XML helpers for VAST generation. All dynamic values must pass through these.

/**
 * XML 1.0's Char production excludes most C0 control characters — only tab
 * (\x09), LF (\x0A) and CR (\x0D) are legal below \x20. Neither entity
 * escaping nor a CDATA section can make one of the others well-formed; a
 * document containing one is simply not valid XML, no matter how it's
 * quoted. Advertiser-supplied free text (a config field with no character-
 * class constraint, e.g. an OMID vendor's VerificationParameters) is the one
 * input class here that isn't already shaped like a URL, so this strips
 * rather than rejects — dropping a stray control byte is better than fail-
 * closing the whole VAST document over it.
 */
function stripIllegalXmlChars(value: string): string {
  // The same production also excludes U+FFFE and U+FFFF, and a lone surrogate
  // encodes no character at all: libxml2 rejects a document carrying either.
  return value.replace(
    /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

/** Escape a string for safe use in an XML attribute or text node. */
export function escapeXml(value: string): string {
  return stripIllegalXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap a value in a CDATA section (the VAST convention for URLs). Any embedded
 * CDATA terminator is split so the section stays well-formed.
 */
export function cdata(value: string): string {
  return `<![CDATA[${stripIllegalXmlChars(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * A fragment's lines for re-indenting, where a line break inside a CDATA
 * section belongs to the value, not to the layout: such a line stays joined to
 * the one its section opened on. Splitting there would push indentation into an
 * advertiser's VerificationParameters, which ADR-0012 passes through opaque.
 */
export function xmlLines(fragment: string): string[] {
  const lines: string[] = [];
  let pending: string | null = null;
  let inCdata = false;
  for (const line of fragment.split("\n")) {
    pending = pending === null ? line : `${pending}\n${line}`;
    for (let at = 0; ; ) {
      const marker = inCdata ? "]]>" : "<![CDATA[";
      const found = line.indexOf(marker, at);
      if (found < 0) break;
      inCdata = !inCdata;
      at = found + marker.length;
    }
    if (!inCdata) {
      lines.push(pending);
      pending = null;
    }
  }
  if (pending !== null) lines.push(pending);
  return lines;
}

/** Indent every non-empty line of a block by `spaces`, leaving CDATA content as it is. */
export function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return xmlLines(block)
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}
