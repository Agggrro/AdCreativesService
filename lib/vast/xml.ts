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
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
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

/** Indent every non-empty line of a block by `spaces`. */
export function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}
