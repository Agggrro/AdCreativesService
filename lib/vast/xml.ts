// XML helpers for VAST generation. All dynamic values must pass through these.

/** Escape a string for safe use in an XML attribute or text node. */
export function escapeXml(value: string): string {
  return value
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
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Indent every non-empty line of a block by `spaces`. */
export function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}
