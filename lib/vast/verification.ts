import type { VastBuildContext } from "./types";
import { cdata, escapeXml } from "./xml";

/** One OMID vendor, as both builders hold it once they have validated it. */
export interface OmidVendor {
  vendor: string;
  /** Already validated https; emitted as given. */
  scriptUrl: string;
  parameters?: string;
}

/**
 * The `<Verification>` element for one OMID vendor (VAST 4.1+), pass-through
 * only — CreoSmith is not itself an OMID vendor (ADR-0012). Pure: the VAST
 * generator (lib/vast-gen, ADR-0035) builds it from its own validated config,
 * the SIMID adapter through `buildAdVerification` below. `ExecutableResource`
 * would precede `JavaScriptResource` in the 4.1/4.2 sequence; we never emit one.
 */
export function omidVerificationXml({ vendor, scriptUrl, parameters }: OmidVendor): string {
  return (
    `<Verification vendor="${escapeXml(vendor)}">\n` +
    `  <JavaScriptResource apiFramework="omid" browserOptional="true">` +
    `${cdata(scriptUrl)}</JavaScriptResource>\n` +
    (parameters ? `  <VerificationParameters>${cdata(parameters)}</VerificationParameters>\n` : "") +
    `</Verification>`
  );
}

/**
 * Builds a VAST 4.1+ <AdVerifications><Verification> block for an OMID
 * verification vendor (pass-through only — see ADR-0012; CreoSmith is not
 * itself an OMID vendor). Returns "" — never a malformed/partial node — when
 * no vendor script URL is configured, the URL isn't well-formed https, or no
 * vendor name is given: `vendor` is a required VAST attribute, and a
 * placeholder like "unknown-omid" would misattribute the node to no real
 * vendor a DSP could act on, so a missing name fails closed the same as a
 * missing/bad URL rather than being papered over.
 */
export function buildAdVerification(ctx: VastBuildContext): string {
  const scriptUrl = ctx.config.verificationScriptUrl?.trim();
  const vendor = ctx.config.verificationVendor?.trim();
  if (!scriptUrl || !vendor) return "";

  let parsed: URL;
  try {
    parsed = new URL(scriptUrl);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:") return "";

  const parameters = ctx.config.verificationParameters?.trim() ?? "";

  // parsed.href, not the raw input: URL's own serialization normalizes/
  // percent-encodes anything the parse step already validated, so the
  // emitted value isn't just "whatever bytes the advertiser typed".
  return omidVerificationXml({ vendor, scriptUrl: parsed.href, parameters });
}
