"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { Chip } from "@/components/ui/Chip";
import { CELL, HEAD, NUM_HEAD, railCell, ROW, TableFrame, TableHead } from "@/components/ui/Table";
import type { PlayerEvent } from "@/components/players/types";
import type { ResolvedAd } from "@/components/validator/ValidatorStage";
import type { ParsedFacts } from "@/lib/vast-inspect/model";

/**
 * The run timeline.
 *
 * What the player reported, in the order it reported it. This is the part of
 * the tool that answers "the tag looks fine, so why is the quartile missing" —
 * the answer is usually a row that never appeared.
 */
export function ValidatorTimeline({ events }: { events: PlayerEvent[] }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);

  if (events.length === 0) {
    return (
      <div className="rounded-ctl border border-hairline bg-surface px-4 py-6">
        <p className="text-[13px] leading-5 text-fg-muted">{t.noTimeline}</p>
      </div>
    );
  }

  return (
    // Purpose-built rather than `TableFrame`: this is the one table in the
    // report that also scrolls vertically, so it needs `overflow-auto` and a
    // height cap rather than the shared horizontal-only frame.
    <div className="max-h-[420px] overflow-auto rounded-ctl border border-hairline bg-surface">
      <table className="w-full min-w-[620px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-hairline bg-surface-sunken">
            <th className={NUM_HEAD}>{t.colTime}</th>
            <th className={HEAD}>{t.colSource}</th>
            <th className={HEAD}>{t.colEvent}</th>
            <th className={HEAD}>{t.colMessage}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={`${event.at}-${event.name}-${index}`} className={ROW}>
              {/* Every row carries a real state — the tone the emitter chose —
                  so every row earns a rail (docs/design-system.md §6). */}
              <td className={railCell(event.tone, "data-instr text-right text-[13px]")}>
                {number.format(event.at)} ms
              </td>
              <td className={`${CELL} whitespace-nowrap`}>
                <Chip>{event.source}</Chip>
              </td>
              <td className={`${CELL} data-instr whitespace-nowrap text-[13px]`}>{event.name}</td>
              {/* Machine text, not prose: what lands here is an SDK message with
                  its numeric codes, or a serialized LOG payload (§4). */}
              <td className={CELL}>
                {event.detail && (
                  <span className="data-instr block max-w-[60ch] text-[13px] leading-5 text-fg-secondary">
                    {event.detail}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- parser vs player ---------- */

interface Comparison {
  key: string;
  /**
   * A VAST element or attribute name, never a composed phrase. That keeps the
   * column machine text — identical in both locales and needing no dictionary
   * entry (§8) — rather than English prose dressed up in mono.
   */
  label: string;
  declared: string;
  resolved: string;
  agrees: boolean;
}

function show(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

/**
 * What the XML declared against what the SDK actually resolved.
 *
 * The cross-check nobody else runs. A validator that only reads XML cannot see
 * that a 30-second declaration resolved to a 15-second creative, and a player
 * that only plays cannot see that the document said otherwise. Running both and
 * diffing them is the one thing having a parser *and* a real SDK buys.
 *
 * A row is only shown when both sides have something to say: a blank on either
 * side means "not comparable", not "mismatch", and printing it as a
 * disagreement would manufacture faults.
 */
export function ParserVsPlayer({ facts, resolved }: { facts: ParsedFacts; resolved: ResolvedAd }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const number = new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 2 });

  const rows: Comparison[] = [];

  if (facts.durationSeconds !== undefined && resolved.duration > 0) {
    // A sub-second gap is transcoding, not a defect; players round to frames.
    const agrees = Math.abs(facts.durationSeconds - resolved.duration) < 1;
    rows.push({
      key: "duration",
      label: "Duration",
      declared: `${number.format(facts.durationSeconds)} s`,
      resolved: `${number.format(resolved.duration)} s`,
      agrees,
    });
  }

  if (facts.universalAdIdValue && resolved.universalAdIdValue) {
    rows.push({
      key: "universalAdId",
      label: "UniversalAdId",
      declared: `${show(facts.universalAdIdRegistry)}: ${facts.universalAdIdValue}`,
      resolved: `${show(resolved.universalAdIdRegistry)}: ${resolved.universalAdIdValue}`,
      agrees: facts.universalAdIdValue === resolved.universalAdIdValue,
    });
  }

  if (facts.mediaWidth && facts.mediaHeight && resolved.width && resolved.height) {
    rows.push({
      key: "dimensions",
      label: "MediaFile",
      declared: `${facts.mediaWidth}×${facts.mediaHeight}`,
      resolved: `${resolved.width}×${resolved.height}`,
      agrees: facts.mediaWidth === resolved.width && facts.mediaHeight === resolved.height,
    });
  }

  if (facts.adSystem && resolved.adSystem) {
    rows.push({
      key: "adSystem",
      label: "AdSystem",
      declared: facts.adSystem,
      resolved: resolved.adSystem,
      agrees: facts.adSystem.trim() === resolved.adSystem.trim(),
    });
  }

  if (facts.apiFrameworks.length > 0 || resolved.apiFramework) {
    const declared = facts.apiFrameworks.join(", ");
    const actual = (resolved.apiFramework ?? "").toLowerCase();
    rows.push({
      key: "apiFramework",
      label: "apiFramework",
      declared: show(declared),
      resolved: show(actual),
      // The player picks one framework out of what the tag offered; agreement
      // means its choice was on the menu, not that the lists are identical.
      agrees: actual === "" ? facts.apiFrameworks.length === 0 : facts.apiFrameworks.includes(actual),
    });
  }

  if (facts.wrapperCount > 0 || resolved.wrapperAdSystems.length > 0) {
    rows.push({
      key: "wrappers",
      label: "Wrapper",
      declared: String(facts.wrapperCount),
      resolved: String(resolved.wrapperAdSystems.length),
      agrees: facts.wrapperCount === resolved.wrapperAdSystems.length,
    });
  }

  if (rows.length === 0) return null;

  return (
    <TableFrame>
      <table className="w-full min-w-[620px] border-collapse">
        <TableHead>
          <th className={HEAD}>{t.colFeature}</th>
          <th className={HEAD}>XML</th>
          <th className={HEAD}>IMA</th>
        </TableHead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={ROW}>
              {/* Agreement is a real state; disagreement rails `warn` because
                  it is a discrepancy to look into, not a spec violation. */}
              <td className={railCell(row.agrees ? "live" : "warn", "data-instr text-[13px]")}>
                {row.label}
              </td>
              <td className={`${CELL} data-instr text-[13px] text-fg-secondary`}>{row.declared}</td>
              <td
                className={`${CELL} data-instr text-[13px] ${
                  row.agrees ? "text-fg-secondary" : "text-warn-fg"
                }`}
              >
                {row.resolved}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
