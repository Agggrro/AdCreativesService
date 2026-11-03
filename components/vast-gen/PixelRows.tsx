"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/Field";
import { MacroText } from "@/components/ui/MacroText";
import { pixelField, rowKey, type PixelDraft, type PixelType } from "./draft";

/**
 * The buyer's own pixels (ADR-0035): one row per URL, each naming what it
 * fires on. One list rather than a field per event, because a buyer pastes
 * pixels in the order their DSP hands them over, and twenty event-shaped
 * fields would be a form to wade through for the two they actually have.
 *
 * Rows are the user's own entries and carry no state, so no rail (§6). The
 * remove control is a word, never an icon (§11). The menu offers only what the
 * chosen VAST version defines; a row whose type the version lacks keeps its
 * value and is named in the form's "left out" notice instead of vanishing.
 */
export function PixelRows({
  pixels,
  offered,
  onChange,
  errors,
}: {
  pixels: PixelDraft[];
  offered: PixelType[];
  onChange: (pixels: PixelDraft[]) => void;
  /** Field id → message, for the rows that have an issue. */
  errors: Map<string, string>;
}) {
  const { dict } = useLocale();
  const t = dict.vastGen;

  const labelFor = (type: PixelType) =>
    type.startsWith("event:") ? type.slice("event:".length) : t.pixelTypes[type as keyof typeof t.pixelTypes];

  const update = (key: string, patch: Partial<PixelDraft>) =>
    onChange(pixels.map((pixel) => (pixel.key === key ? { ...pixel, ...patch } : pixel)));

  return (
    <div className="flex flex-col gap-3">
      {pixels.length === 0 ? (
        <p className="type-small text-fg-muted">{t.noPixels}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pixels.map((pixel) => {
            const id = pixelField(pixel.key);
            const error = errors.get(id);
            const unavailable = !offered.includes(pixel.type);
            // The current type stays in the menu even when this version lacks
            // it, so the select never silently changes what a row says.
            const types = unavailable ? [pixel.type, ...offered] : offered;
            return (
              <li key={pixel.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={t.pixelEvent}
                    value={pixel.type}
                    onChange={(event) => update(pixel.key, { type: event.target.value as PixelType })}
                    className={`${inputBaseClass} w-auto min-w-40`}
                  >
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {labelFor(type)}
                      </option>
                    ))}
                  </select>
                  <input
                    id={id}
                    type="url"
                    inputMode="url"
                    spellCheck={false}
                    aria-label={t.pixelUrl}
                    aria-invalid={error ? true : undefined}
                    value={pixel.url}
                    placeholder="https://"
                    onChange={(event) => update(pixel.key, { url: event.target.value })}
                    className={`${inputBaseClass} min-w-0 flex-1 basis-48`}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(pixels.filter((other) => other.key !== pixel.key))}
                    className={buttonClass("ghost", "sm")}
                  >
                    {t.removePixel}
                  </button>
                </div>
                {error ? (
                  <span role="alert" className="type-caption text-dead">
                    <MacroText text={error} />
                  </span>
                ) : (
                  unavailable && <span className="type-caption text-fg-muted">{t.pixelNotInTag}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChange([...pixels, { key: rowKey(), type: "impression", url: "" }])}
        className={`${buttonClass("secondary", "sm")} self-start`}
      >
        {t.addPixel}
      </button>
    </div>
  );
}
