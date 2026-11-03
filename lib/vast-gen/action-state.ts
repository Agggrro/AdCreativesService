import type { Issue } from "./validate";

/**
 * What the VAST generator's save actions answer when they do not redirect
 * (ADR-0035). The form keeps its own state, so a refused save comes back as
 * data the form can place on its fields, never as a navigation that would
 * reset them. A successful save redirects to the creative's page instead.
 */
export interface GeneratorActionState {
  error?:
    | "issues"
    | "unauthorized"
    | "save_failed"
    | "self_check"
    | "media_missing"
    | "not_found";
  /** For `issues`: the validator's verdict, by config path. */
  issues?: Issue[];
  /** For `self_check`: the inspector's first finding, in both locales. */
  finding?: { ru: string; en: string };
}
