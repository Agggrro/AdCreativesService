import { RefreshCw } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n/dictionaries";
import { asJsonObject } from "@/lib/json";
import { isPostbackSuccess, POSTBACK_PARAMS, STATUS_ALIASES } from "@/lib/postback";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { MacroText } from "@/components/ui/MacroText";
import { Notice, Panel } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateWord, type Tone } from "@/components/ui/State";
import {
  CELL,
  CELL_TIGHT,
  HEAD,
  HEAD_TIGHT,
  NUM_HEAD_TIGHT,
  ROW,
  TableFrame,
  TableHead,
  railCellTight,
} from "@/components/ui/Table";
import type { ConversionStatus } from "@/types/database.types";
import { rotatePostbackKey } from "./actions";

/**
 * The account's postback settings (ADR-0023): the URL a partner network calls
 * when a viewer converts, what it may send, and what it actually sent.
 *
 * Account-wide rather than per creative, because that is how a network is set
 * up: one postback URL per network, for every offer the account runs. The click
 * id already says which creative a conversion belongs to. It lives under
 * /dashboard/creatives/ so the section marker stays on "My creatives", the
 * section whose numbers it feeds.
 */

/** Every row the parameters table explains, in the order they appear in the URL. */
const PARAM_ROWS = ["key", ...POSTBACK_PARAMS] as const;

/**
 * Conversion statuses as state (§3, as amended for ADR-0023). A rejected
 * conversion is not an alarm — nothing about the account is failing, the
 * advertiser just did not pay for it — so it is `idle`, not `dead`.
 */
const STATUS_TONE: Record<ConversionStatus, Tone> = {
  approved: "live",
  pending: "info",
  rejected: "idle",
};

const STATUS_ORDER: ConversionStatus[] = ["approved", "pending", "rejected"];

function resultText(dict: Dict, result: string): string {
  const known = dict.postback.results as Record<string, string>;
  return known[result] ?? dict.postback.results.unknown;
}

/** Machine time, same in both locales: the log is read against a network's own. */
function utcTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

export default async function PostbackPage({
  searchParams,
}: {
  searchParams: Promise<{ rotate?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const t = dict.postback;

  const [{ data: key, error: keyError }, { data: log, error: logError }] =
    await Promise.all([
      // Creates the key on first visit; every later call returns the same one.
      supabase.rpc("ensure_postback_key"),
      supabase.rpc("get_postback_log", { p_limit: 50 }),
    ]);

  // The partner network fills the right-hand side of each pair with its own
  // macros; `{click_id}` there is a placeholder for whichever of its macros
  // carries our click id back. The app domain, not the ad domain: this URL is
  // called by a network's server, never from a publisher's page (ADR-0018).
  const url =
    !keyError && typeof key === "string" && key
      ? `${getSiteUrl()}/pb?key=${key}` +
        POSTBACK_PARAMS.map((name) => `&${name}={${name}}`).join("")
      : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {/* `live`: the rotation lands back on this same page after a soft
          navigation that moves no focus, so without it a screen reader hears
          nothing about the key it just replaced. */}
      {sp.rotate === "done" && (
        <Notice tone="info" live>
          {t.rotated}
        </Notice>
      )}
      {sp.rotate === "failed" && (
        <Notice tone="dead" live>
          {t.rotateFailed}
        </Notice>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="label-instr">{t.howHeading}</h2>
        <ol className="flex max-w-prose list-decimal flex-col gap-2 pl-5 type-small text-fg-secondary">
          <li>
            <MacroText text={t.step1} />
          </li>
          <li>
            <MacroText text={t.step2} />
          </li>
          <li>{t.step3}</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-instr">{t.urlHeading}</h2>
        {url ? (
          <Panel className="flex flex-col gap-4 p-4">
            {/* Wraps rather than truncates: the key sits in the middle of the
                URL, and a clipped key is the one thing the reader must see
                whole to check it against what their network holds. */}
            <code className="data-instr break-all type-small text-fg-secondary">
              {url}
            </code>
            {/* `sm`: controls inside a panel (§6). */}
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton
                value={url}
                size="sm"
                labels={{ copy: dict.common.copyUrl, copied: dict.common.urlCopied }}
              />
              <ConfirmAction
                triggerLabel={t.rotate}
                triggerIcon={<RefreshCw size={14} aria-hidden />}
                triggerSize="sm"
                title={t.rotateTitle}
                body={t.rotateBody}
                confirmLabel={t.rotateConfirm}
                action={rotatePostbackKey}
              />
            </div>
            <p className="type-caption text-fg-muted">{t.keyWarning}</p>
          </Panel>
        ) : (
          <Notice tone="dead">{t.keyUnavailable}</Notice>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-instr">{t.paramsHeading}</h2>
        {/* Reference rows carry no state, so no rail (§6). */}
        <TableFrame>
          <table className="w-full border-collapse type-small">
            <TableHead>
              <th className={HEAD}>{t.param}</th>
              <th className={`${HEAD} w-full`}>{t.meaning}</th>
            </TableHead>
            <tbody>
              {PARAM_ROWS.map((name) => (
                <tr key={name} className={ROW}>
                  <td className={`${CELL} data-instr whitespace-nowrap`}>{name}</td>
                  <td className={`${CELL} text-fg-secondary`}>
                    <MacroText text={t.params[name]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-instr">{t.statusesHeading}</h2>
        <TableFrame>
          <table className="w-full border-collapse type-small">
            <TableHead>
              <th className={HEAD}>{t.statusCol}</th>
              <th className={`${HEAD} w-full`}>{t.acceptedCol}</th>
            </TableHead>
            <tbody>
              {STATUS_ORDER.map((status) => (
                <tr key={status} className={ROW}>
                  <td className={`${CELL} whitespace-nowrap`}>
                    <StateWord tone={STATUS_TONE[status]} label={t.statuses[status]} />
                  </td>
                  <td className={`${CELL} data-instr text-fg-secondary`}>
                    {STATUS_ALIASES[status].join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="label-instr">{t.logHeading}</h2>
          <span className="type-caption text-fg-muted">{t.logRetention}</span>
        </div>
        {logError ? (
          <Notice tone="dead">{t.logUnavailable}</Notice>
        ) : !log || log.length === 0 ? (
          <Panel className="p-6">
            <p className="type-small text-fg-muted">{t.logEmpty}</p>
          </Panel>
        ) : (
          // Readout density (§6): rows the system emits and the reader scans,
          // none of them actionable. The rail is the one thing a failure must
          // show at a glance, so it is real state — landed or not.
          <TableFrame>
            <table className="w-full border-collapse">
              <TableHead>
                <th className={HEAD_TIGHT}>{t.time}</th>
                <th className={`${HEAD_TIGHT} min-w-80`}>{t.result}</th>
                {POSTBACK_PARAMS.map((name) => (
                  <th
                    key={name}
                    className={name === "payout" ? NUM_HEAD_TIGHT : HEAD_TIGHT}
                  >
                    {name}
                  </th>
                ))}
              </TableHead>
              <tbody>
                {log.map((row, i) => {
                  const ok = isPostbackSuccess(row.result);
                  const params = asJsonObject(row.params);
                  return (
                    <tr key={`${row.received_at}-${i}`} className={ROW}>
                      <td
                        className={railCellTight(
                          ok ? "live" : "dead",
                          "data-instr whitespace-nowrap",
                        )}
                      >
                        {utcTime(row.received_at)}
                      </td>
                      <td className={CELL_TIGHT}>
                        {/* One line where it fits, so a landed postback stays
                            a 32px row; a long reason wraps under its word. */}
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <StateWord
                            tone={ok ? "live" : "dead"}
                            label={ok ? t.ok : t.failed}
                          />
                          <span className="type-caption text-fg-muted">
                            <MacroText text={resultText(dict, row.result)} />
                          </span>
                        </span>
                      </td>
                      {POSTBACK_PARAMS.map((name) => {
                        const value = params[name];
                        return (
                          <td
                            key={name}
                            // A click id broken across two lines cannot be
                            // compared against the network's log by eye; only
                            // the free-form txid (up to 128 characters) wraps.
                            className={`${CELL_TIGHT} data-instr ${
                              name === "txid" ? "break-all" : "whitespace-nowrap"
                            } ${name === "payout" ? "text-right" : ""} ${
                              typeof value === "string" ? "" : "text-fg-muted"
                            }`}
                          >
                            {/* Not sent is not the same as sent empty. */}
                            {typeof value === "string" ? value : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}
