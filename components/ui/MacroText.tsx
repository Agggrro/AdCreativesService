/**
 * Copy that names machine values inline — "put {click_id} into the offer link",
 * "send `USD`". The sentence is human text and stays sans; the value is what the
 * user types or reads character for character, so it takes the mono face
 * (docs/design-system.md §4). Marking it inside the dictionary string rather
 * than splitting the string keeps each sentence whole, so a translator sees one
 * sentence and not three fragments.
 *
 * Two markers:
 * - `{macro}` renders as written, braces included — the braces are part of what
 *   the user types.
 * - `` `value` `` renders without the backticks — a parameter name, a sample
 *   value, a currency code.
 *
 * No "use client": it renders the same in a server page and in the configurator.
 */
const MACHINE = /(\{[a-z_…]+\}|`[^`]+`)/;

export function MacroText({ text }: { text: string }) {
  // `split` with a capturing group keeps the separators, at the odd indices.
  return (
    <>
      {text.split(MACHINE).map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="data-instr">
            {part.startsWith("`") ? part.slice(1, -1) : part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
