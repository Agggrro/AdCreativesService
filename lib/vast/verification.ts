import type { VastBuildContext } from "./types";
import { cdata, escapeXml } from "./xml";

/**
 * Builds a VAST 4.1+ <AdVerifications><Verification> block for an OMID
 * verification vendor (pass-through only — see ADR-0012; AdInteract is not
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

  return (
    `<Verification vendor="${escapeXml(vendor)}">\n` +
    `  <JavaScriptResource apiFramework="omid" browserOptional="true">` +
    // parsed.href, not the raw input: URL's own serialization normalizes/
    // percent-encodes anything the parse step already validated, so the
    // emitted value isn't just "whatever bytes the advertiser typed".
    `${cdata(parsed.href)}</JavaScriptResource>\n` +
    (parameters
      ? `  <VerificationParameters>${cdata(parameters)}</VerificationParameters>\n`
      : "") +
    `</Verification>`
  );
}
