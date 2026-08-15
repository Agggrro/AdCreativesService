import type { Finding } from "../model";
import { deliveryRules } from "./delivery";
import { documentRules } from "./document";
import { inlineRules } from "./inline";
import { interactiveRules } from "./interactive";
import { linearRules } from "./linear";
import { modernRules } from "./modern";
import { orderingRules } from "./ordering";
import { trackingRules } from "./tracking";
import { verificationRules } from "./verification";
import { wrapperRules } from "./wrapper";
import type { Rule, RuleContext } from "./kit";

export type { Rule, RuleContext, RuleHit } from "./kit";

/**
 * The catalogue, in the order findings are grouped for a reader: is it XML at
 * all, is the ad well-formed, does it have media, does the chain resolve, is it
 * measurable, is it modern, will it survive the wire.
 */
export const ALL_RULES: readonly Rule[] = [
  ...documentRules,
  ...orderingRules,
  ...inlineRules,
  ...linearRules,
  ...wrapperRules,
  ...trackingRules,
  ...interactiveRules,
  ...verificationRules,
  ...modernRules,
  ...deliveryRules,
];

export interface RuleRunResult {
  findings: Finding[];
  /** Ids of rules that threw. See below for why this is not simply swallowed. */
  degraded: string[];
}

/**
 * Run every applicable rule against one document.
 *
 * A rule that throws is contained rather than allowed to abort the report: a
 * bug in one check must not cost the user the other seventy.
 *
 * But it is *recorded*, not swallowed. For a validator a silent exception is
 * the worst possible failure: the rule stops firing on some class of input,
 * the report looks complete, and nobody can tell the difference between "no
 * violation" and "the check never ran". The id goes into `degraded` so the
 * report can say the analysis was partial.
 */
export function runRules(ctx: RuleContext): RuleRunResult {
  const findings: Finding[] = [];
  const degraded: string[] = [];

  for (const rule of ALL_RULES) {
    if (rule.appliesTo && !rule.appliesTo(ctx)) continue;

    let hits;
    try {
      hits = rule.check(ctx);
    } catch {
      degraded.push(rule.id);
      continue;
    }

    for (const found of hits) {
      findings.push({
        ruleId: rule.id,
        group: rule.group,
        severity: rule.severity,
        spec: rule.spec,
        iabErrorCode: found.iabErrorCode ?? rule.iabErrorCode,
        hop: ctx.hop,
        path: found.path,
        line: found.line,
        message: found.message,
        hint: found.hint,
        offending: found.offending,
      });
    }
  }

  return { findings, degraded };
}
