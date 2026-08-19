"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { Chip } from "@/components/ui/Chip";
import { HelpLabel } from "@/components/ui/Tooltip";
import {
  CELL_TIGHT,
  HEAD_TIGHT,
  NUM_HEAD_TIGHT,
  railCellTight,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";
import { joinTrackers } from "@/components/tools/tracker-join";
import type { PlayerEvent } from "@/components/players/types";
import type { ResolvedAd } from "@/components/validator/ValidatorStage";
import type { ParsedFacts, TrackerHit } from "@/lib/vast-inspect/model";

/**
 * The run timeline, at the readout density (docs/design-system.md §6).
 *
 * What the player reported, in the order it reported it, with the tracking
 * address each event carries. This is the part of the tool that answers "the tag
 * looks fine, so why is the quartile missing" — the answer is usually a row that
 * never appeared, or an address sitting in the unfired list at the bottom.
 *
 * The addresses used to be a second table repeating the same event vocabulary a
 * screen further down. Merging them is not only compaction: the question "did
 * this quartile fire, and to whom" is one question, and it was being answered in
 * two places that the reader had to join by hand.
 */
export function ValidatorTimeline({
  events,
  trackers = [],
}: {
  events: PlayerEvent[];
  /** Declared trackers from the report, joined onto the events by name. */
  trackers?: TrackerHit[];
}) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);
  const { rows, unfired } = joinTrackers(events, trackers);

  if (events.length === 0) {
    return (
      <div className="rounded-ctl border border-hairline bg-surface px-3 py-4">
        <p className="text-[13px] leading-5 text-fg-muted">{t.noTimeline}</p>
      </div>
    );
  }

  return (
    // Purpose-built rather than `TableFrame`: this is the one table in the
    // report that also scrolls vertically, so it needs `overflow-auto` and a
    // height cap rather than the shared horizontal-only frame.
    <div className="max-h-[520px] overflow-auto rounded-ctl border border-hairline bg-surface">
      <table className="w-full min-w-[520px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-hairline bg-surface-sunken">
            <th className={NUM_HEAD_TIGHT}>{t.colTime}</th>
            <th className={HEAD_TIGHT}>{t.colSource}</th>
            <th className={HEAD_TIGHT}>{t.colEvent}</th>
            <th className="whitespace-nowrap px-3 py-1.5 text-left">
              <HelpLabel label={t.colTracker} help={t.trackerHelp} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ event, trackers: hits }, index) => (
            <tr key={`${event.at}-${event.name}-${index}`} className={ROW}>
              {/* Every row carries a real state — the tone the emitter chose —
                  so every row earns a rail (docs/design-system.md §6). */}
              {/* nowrap: at this column width a four-digit reading wraps to
                  "1,759" / "ms" and silently doubles the row height. */}
              <td
                className={railCellTight(
                  event.tone,
                  "data-instr whitespace-nowrap text-right text-[13px]",
                )}
              >
                {number.format(event.at)} {t.ms}
              </td>
              <td className={`${CELL_TIGHT} whitespace-nowrap`}>
                {/* Flex, not a bare inline-block: a chip on the cell's text baseline
                    drags the line box past the row height (see CELL_TIGHT). */}
                <span className="flex items-center">
                  <Chip>{event.source}</Chip>
                </span>
              </td>
              <td className={`${CELL_TIGHT} data-instr text-[13px]`}>
                <span className="flex flex-col gap-0.5">
                  <span className="whitespace-nowrap">{event.name}</span>
                  {/* Machine text, not prose: what lands here is an SDK message
                      with its numeric codes, or a serialized LOG payload (§4). */}
                  {event.detail && (
                    <span className="block max-w-[52ch] leading-5 text-fg-secondary">
                      {event.detail}
                    </span>
                  )}
                </span>
              </td>
              <td className={CELL_TIGHT}>
                {hits.map((hit, position) => (
                  <code
                    key={`${hit.path}-${position}`}
                    className="data-instr block max-w-[56ch] truncate text-[13px] text-fg-secondary"
                  >
                    {hit.url}
                  </code>
                ))}
              </td>
            </tr>
          ))}

          {unfired.length > 0 && (
            <>
              <tr className="border-b border-hairline bg-surface-sunken">
                <td className="px-3 py-1.5 label-instr" colSpan={4}>
                  {t.trackersUnfired} · {number.format(unfired.length)}
                </td>
              </tr>
              {unfired.map((hit, index) => (
                <tr key={`${hit.path}-${index}`} className={ROW}>
                  {/* No rail. We did not observe these failing to fire — we
                      inferred it from a name join — and a rail would assert a
                      state the tool did not measure (§6). */}
                  <td
                    className={railCellTight(
                      null,
                      "data-instr whitespace-nowrap text-right text-[13px] text-fg-muted",
                    )}
                  >
                    —
                  </td>
                  <td className={`${CELL_TIGHT} data-instr whitespace-nowrap text-[13px] text-fg-muted`}>
                    #{hit.hop}
                  </td>
                  <td className={`${CELL_TIGHT} data-instr whitespace-nowrap text-[13px] text-fg-muted`}>
                    {hit.event ? `${hit.kind}:${hit.event}` : hit.kind}
                  </td>
                  <td className={CELL_TIGHT}>
                    <code className="data-instr block max-w-[56ch] truncate text-[13px] text-fg-secondary">
                      {hit.url}
                    </code>
                  </td>
                </tr>
              ))}
            </>
          )}
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
      declared: `${number.format(facts.durationSeconds)} ${t.unitSeconds}`,
      resolved: `${number.format(resolved.duration)} ${t.unitSeconds}`,
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
      <table className="w-full min-w-[480px] border-collapse">
        <TableHead>
          <th className={HEAD_TIGHT}>{t.colFeature}</th>
          <th className={HEAD_TIGHT}>XML</th>
          <th className={HEAD_TIGHT}>IMA</th>
        </TableHead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={ROW}>
              {/* Agreement is a real state; disagreement rails `warn` because
                  it is a discrepancy to look into, not a spec violation. */}
              <td className={railCellTight(row.agrees ? "live" : "warn", "data-instr text-[13px]")}>
                {row.label}
              </td>
              <td className={`${CELL_TIGHT} data-instr text-[13px] text-fg-secondary`}>
                {row.declared}
              </td>
              <td
                className={`${CELL_TIGHT} data-instr text-[13px] ${
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
