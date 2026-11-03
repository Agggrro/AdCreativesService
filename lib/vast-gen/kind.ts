/**
 * The VAST video creative (ADR-0035): a plain linear video with trackers, built
 * on /tools/vast-generator, served by lib/vast-gen rather than by a format
 * adapter. These two names are the whole contract with the database: the
 * system template's `templates.type`, and the one entry of its
 * `supported_standards` that a creative stores as `selected_format`.
 */
export const VIDEO_FORMAT = "video";

/** `templates.type` of the system template every VAST video creative points at. */
export const VIDEO_TEMPLATE_TYPE = "vast_video";
