"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputBaseClass, inputClass, Notice, Panel } from "@/components/ui/Field";
import { MacroText } from "@/components/ui/MacroText";
import { Segmented } from "@/components/ui/Segmented";
import { HelpLabel } from "@/components/ui/Tooltip";
import { OutlineNav, SectionChips, type NavSection } from "@/components/workspace/SectionNav";
import { DegradedNotice, Recommendations, VerdictStrip } from "@/components/tools/ValidatorReport";
import { SDK_LOAD_FAILED, ValidatorStage } from "@/components/validator/ValidatorStage";
import { WellFrame, WellIdle } from "@/components/validator/WellFrame";
import { IMA_SDK_SRC } from "@/components/players/load-ima-sdk";
import type { PlayerEvent } from "@/components/players/types";
// Per-module imports: the @/lib/vast-inspect barrel reaches node:dns through
// the fetcher and cannot be bundled for the browser. These are pure.
import type { InspectReport } from "@/lib/vast-inspect/model";
import { buildVideoVast } from "@/lib/vast-gen/build";
import type { GeneratorActionState } from "@/lib/vast-gen/action-state";
import { PREVIEW_CREATIVE_ID, previewBeacons } from "@/lib/vast-gen/preview";
import {
  featureSince,
  GENERATOR_VERSIONS,
  PROGRESS_EVENTS,
  supports,
  type GeneratorFeature,
} from "@/lib/vast-gen/spec";
import { LIMITS, parseVideoConfig, type Issue } from "@/lib/vast-gen/validate";
import {
  clearDraft,
  draftToConfig,
  emptyCompanion,
  isEmptyDraft,
  parseStoredDraft,
  pixelTypes,
  pruneStoredDraft,
  readDraftRaw,
  saveDraft,
  subscribeDraft,
  type CompanionDraft,
  type Corner,
  type GeneratorDraft,
} from "./draft";
import { MediaSourceField } from "./MediaSourceField";
import { PixelRows } from "./PixelRows";

/** One section of the form: its entry in the outline and what the inspector shows. */
interface SectionDef {
  id: string;
  title: string;
  /** Behind the title, for an explanation and not a limit (§6, "Help tooltip"). */
  help?: string;
  content: React.ReactNode;
}

/**
 * Which section a field lives in, from its id — the ids the draft's `origin` map
 * names. An error in a section the inspector is not showing opens that section.
 */
function sectionOf(fieldId: string): string {
  if (fieldId === "version") return "version";
  if (["adTitle", "name", "description", "advertiser"].includes(fieldId)) return "basics";
  if (fieldId === "media") return "video";
  if (fieldId === "clickThroughUrl") return "click";
  if (fieldId.startsWith("skip")) return "skip";
  if (fieldId.startsWith("pixel")) return "tracking";
  if (fieldId.startsWith("companion")) return "companions";
  if (fieldId.startsWith("icon")) return "icon";
  if (fieldId.startsWith("omid")) return "omid";
  if (fieldId.startsWith("uaid")) return "uaid";
  return "";
}

/** The content clip a preroll interrupts — the validator's own, served from our origin. */
const INSTREAM_CONTENT_SRC = "/tools/instream-content.mp4";

/** Features that arrive in a later version, in the order the form lists them. */
const LATER: GeneratorFeature[] = [
  "advertiser",
  "skip",
  "icon",
  "universalAdId",
  "viewableImpression",
  "thirdPartyError",
  "companionClickTracking",
  "omid",
];

/**
 * Focus a field by its form id: the control itself, or — for a media field,
 * whose id is on its wrapper — the control that field currently shows.
 */
function focusField(id: string): void {
  const element = document.getElementById(id);
  const target = element?.matches("input, select, textarea, button")
    ? element
    : element?.querySelector<HTMLElement>("[data-focus]");
  target?.focus();
}

/**
 * The VAST generator's form (ADR-0035), used for a new creative on
 * /tools/vast-generator and for editing one on its dashboard page.
 *
 * The draft is translated into a config and run through the same validator and
 * builder the ad path uses, on every change, in the browser: the XML beside the
 * form is what the saved tag will be, less its signed links. The server action
 * repeats the validation and adds what only the server can — the owner's
 * uploads, their sizes, and our own validator's verdict on the document.
 *
 * Layout is the workspace's (docs/design-system.md §6, "Workspace" and "Free
 * tools"; ADR-0038): from `lg` an outline of the tag's sections, the stage — the
 * player or the tag's document — and a 340px inspector with one section's fields;
 * below it the stage first, the sections as chips, then the inspector. The accent
 * budget is the one primary, Create; checking and playing is a secondary on the
 * stage.
 */
export function VideoTagGenerator({
  mode,
  signedIn,
  resume = false,
  cdnUrl,
  signInHref,
  action,
  creativeId,
  initialDraft,
  cancelHref,
  bar,
  heading,
  notice,
}: {
  mode: "create" | "edit";
  signedIn: boolean;
  /** Back from signing in (`?resume=1`): only then is a stored draft restored (ADR-0036). */
  resume?: boolean;
  /** Where the tag's beacons will live, for a preview that reads like the real thing. */
  cdnUrl: string;
  /** The login page, with a `next` back here. */
  signInHref: string;
  action: (state: GeneratorActionState, formData: FormData) => Promise<GeneratorActionState>;
  creativeId?: string;
  initialDraft: GeneratorDraft;
  cancelHref?: string;
  /** The screen's bar — the tools' (`ToolBar`) or a creative's (`WorkspaceBar`). */
  bar?: React.ReactNode;
  /** The page's `h1`, for assistive technology; the bar and the outline carry the visible names. */
  heading?: string;
  /** A notice for the top of the stage — what a stored config lost on the way in (the edit page). */
  notice?: React.ReactNode;
}) {
  const { dict, locale } = useLocale();
  const t = dict.vastGen;
  const tv = dict.tools.validator;
  const router = useRouter();

  // A new creative's draft lives in this browser across a sign-in round trip
  // (ADR-0036): saved when the visitor leaves to sign in, read back here when
  // they return to `?resume=1`. The store's server snapshot is null, so the
  // server's render and the hydrating one agree, and React re-renders with the
  // stored draft right after.
  const storedRaw = useSyncExternalStore(subscribeDraft, readDraftRaw, () => null);
  const stored = useMemo(() => {
    const parsed = mode === "create" && resume ? parseStoredDraft(storedRaw) : null;
    return parsed && !isEmptyDraft(parsed) ? parsed : null;
  }, [mode, resume, storedRaw]);
  // Null until the first change; from then on the draft is this component's own.
  const [edited, setEdited] = useState<GeneratorDraft | null>(null);
  const draft = edited ?? stored ?? initialDraft;
  const restored = edited === null && stored !== null;
  // Field errors appear after the first attempt to save, not while typing.
  const [attempted, setAttempted] = useState(false);
  // The inspector shows one section; the stage shows the player or the document.
  const [activeId, setActiveId] = useState("version");
  const [view, setView] = useState<"player" | "xml">("player");
  const [state, formAction, pending] = useActionState(action, {} as GeneratorActionState);

  // What sits in storage past its day, or unreadable, is removed — not only ignored.
  useEffect(() => {
    if (mode === "create") pruneStoredDraft();
  }, [mode]);

  /**
   * Apply a change computed from the draft as it is *when the change lands*.
   * An upload or a link check finishes seconds after it started, by which time
   * another banner may have its image or have been removed; computing from the
   * render the upload started in would undo that.
   */
  const update = useCallback(
    (change: (current: GeneratorDraft) => Partial<GeneratorDraft>) =>
      setEdited((current) => {
        const base = current ?? stored ?? initialDraft;
        return { ...base, ...change(base) };
      }),
    [stored, initialDraft],
  );
  const patch = useCallback((next: Partial<GeneratorDraft>) => update(() => next), [update]);
  const updateCompanion = useCallback(
    (key: string, next: Partial<CompanionDraft>) =>
      update((current) => ({
        companions: current.companions.map((other) => (other.key === key ? { ...other, ...next } : other)),
      })),
    [update],
  );

  const goSignIn = useCallback(() => {
    saveDraft(draft);
    router.push(signInHref);
  }, [draft, router, signInHref]);

  // --- the same validator and builder as the ad path ---
  const translated = useMemo(() => draftToConfig(draft), [draft]);
  const configJson = useMemo(() => JSON.stringify(translated.config), [translated]);
  const parsed = useMemo(() => parseVideoConfig(translated.config, { mode: "preview" }), [translated]);
  const xml = useMemo(
    () =>
      parsed.ok
        ? buildVideoVast(parsed.config, previewBeacons(cdnUrl), { creativeId: creativeId ?? PREVIEW_CREATIVE_ID })
        : null,
    [parsed, cdnUrl, creativeId],
  );
  // What the browser can already tell is wrong: the form's own checks, then the validator's.
  const clientIssues = useMemo(
    () => [...translated.issues, ...(parsed.ok ? [] : parsed.issues)],
    [translated, parsed],
  );

  // The server's answer is about the config it was sent. Once the form has
  // changed, its issues would land on whichever row now has that index.
  const [submitted, setSubmitted] = useState<string | null>(null);
  const answerIsCurrent = submitted !== null && submitted === configJson;
  const serverIssues = useMemo(
    () => (answerIsCurrent && state.error === "issues" ? (state.issues ?? []) : []),
    [answerIsCurrent, state],
  );

  const issueText = useCallback((issue: Issue) => t.issues[issue.code] ?? t.issues.bad_shape, [t]);

  /** Field id → message: the browser's own check after an attempt, then the server's. */
  const fieldErrors = useMemo(() => {
    const errors = new Map<string, string>();
    const place = (list: Issue[]) => {
      for (const issue of list) {
        const field = translated.origin.get(issue.path) ?? "";
        if (field && !errors.has(field)) errors.set(field, issueText(issue));
      }
    };
    if (attempted) place(clientIssues);
    place(serverIssues);
    return errors;
  }, [attempted, clientIssues, serverIssues, translated, issueText]);

  /** Issues with no field to sit under (the size cap, a list too long), from either side. */
  const looseIssues = useMemo(() => {
    const list = [...(attempted ? clientIssues : []), ...serverIssues];
    return [...new Set(list.filter((issue) => !translated.origin.get(issue.path)).map(issueText))];
  }, [attempted, clientIssues, serverIssues, translated, issueText]);

  // --- check and play, in the well ---
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<InspectReport | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [ranXml, setRanXml] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [sandboxMissing, setSandboxMissing] = useState(false);
  const [sdkBlocked, setSdkBlocked] = useState(false);
  // Only the one fact the generator shows is kept; it has no event timeline.
  const onEvent = useCallback((event: PlayerEvent) => {
    if (event.name === SDK_LOAD_FAILED) setSdkBlocked(true);
  }, []);
  // A verdict and a playback describe the document they ran on. Once the form
  // has changed it, they would be describing something else.
  const runIsCurrent = ranXml !== null && ranXml === xml;

  async function run() {
    if (!xml) return;
    setRunning(true);
    setRunError(null);
    setReport(null);
    setSdkBlocked(false);
    setRanXml(xml);
    // Synchronous, before the await: IMA's initialize() must run inside the
    // click that started this (see ValidatorStage).
    setRunToken((token) => token + 1);
    try {
      const response = await fetch("/api/tools/vast/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "xml", value: xml, pixelMode: "dryRun" }),
      });
      const data = (await response.json()) as InspectReport | { error: string };
      if (!response.ok || "error" in data) {
        // The route's own `error` is English for developers; the visitor gets
        // their language (CLAUDE.md, rule 7).
        setRunError(response.status === 413 ? tv.errTooLarge : tv.errRequest);
        setRunToken(0);
        return;
      }
      setReport(data);
    } catch {
      setRunError(tv.errRequest);
      setRunToken(0);
    } finally {
      setRunning(false);
    }
  }

  const unplayable = runIsCurrent && report !== null && !report.playback.adsResponse && !report.playback.adTagUrl;

  // --- what this version leaves out, and what later versions add ---
  const later = LATER.filter((feature) => !supports(draft.version, feature));
  const laterGroups = [...new Set(later.map(featureSince))].map((since) => ({
    since,
    features: later.filter((feature) => featureSince(feature) === since).map((feature) => t.features[feature]),
  }));
  const excludedText = translated.excluded.map((feature) => t.features[feature]).join(", ");

  const companionsOn = draft.companions.length > 0;
  const iconAllowed = draft.icon === "on" && supports(draft.version, "icon");
  const offeredPixels = pixelTypes(draft.version, companionsOn, iconAllowed);
  const ourTrackers = [
    "Impression",
    "Error",
    "ClickTracking",
    ...PROGRESS_EVENTS,
    ...(supports(draft.version, "viewableImpression") ? ["Viewable"] : []),
  ];

  // A session that expired while the form was open: signing in is the way on.
  const sessionExpired = state.error === "unauthorized";
  const mustSignIn = (!signedIn && mode === "create") || sessionExpired;

  /** Mark what the browser can already tell is wrong, and focus the first of it; false when nothing is. */
  function markIssues(): boolean {
    if (clientIssues.length === 0) return false;
    setAttempted(true);
    const first = clientIssues.map((issue) => translated.origin.get(issue.path)).find(Boolean);
    if (first) {
      // The section has to be on screen before its field exists to focus.
      setActiveId(sectionOf(first) || "version");
      requestAnimationFrame(() => focusField(first));
    }
    return true;
  }

  /** Ask the browser what is wrong first: signing in only to learn it afterwards is a wasted trip. */
  function signInToCreate() {
    if (!markIssues()) goSignIn();
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Dispatched by hand, in a transition: a form `action` would have React
    // reset the form once the action settles, and a controlled <select> does
    // not survive that reset — every pixel row would read "Impression" after a
    // refused save while the state still said "Click".
    event.preventDefault();
    // A guest's primary button goes to sign in; Enter in a field of the form is the
    // other way to submit it, and it has to lead to the same place — not to a save
    // the server can only refuse.
    if (mustSignIn) {
      signInToCreate();
      return;
    }
    if (markIssues()) return;
    const formData = new FormData(event.currentTarget);
    setSubmitted(configJson);
    // From here the draft is this component's own state, not the stored copy:
    // the copy is cleared once the save is on its way, and a refused save must
    // still find everything the visitor restored.
    setEdited(draft);
    if (mode === "create") clearDraft();
    startTransition(() => formAction(formData));
  }

  const serverError = sessionExpired
    ? t.errUnauthorized
    : !answerIsCurrent
      ? null
      : state.error === "not_found"
        ? t.errNotFound
        : state.error === "save_failed"
          ? t.errSaveFailed
          : state.error === "media_missing"
            ? t.errMediaMissing
            : state.error === "self_check"
              ? `${t.errSelfCheck} ${state.finding?.[locale] ?? t.selfCheckIncomplete}`
              : state.error === "issues"
                ? t.fixErrors
                : null;
  // Below `lg` the notice scrolls with the section and the buttons stay at the foot
  // of the screen, so a refusal that comes back from the server may be out of sight.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (serverError) noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [serverError]);

  /** A field's caption: its error, or its help, or nothing — and the id that ties it to the control. */
  const hint = (id: string, help?: string) => {
    const error = fieldErrors.get(id);
    const text = error ?? help;
    return {
      describedBy: text ? `${id}-hint` : undefined,
      node: text ? (
        <span id={`${id}-hint`} role={error ? "alert" : undefined} className={`type-caption ${error ? "text-dead" : "text-fg-muted"}`}>
          <MacroText text={text} />
        </span>
      ) : null,
      invalid: error ? true : undefined,
    };
  };

  const text = (id: keyof GeneratorDraft, label: string, help?: string, options: { area?: boolean; placeholder?: string; url?: boolean } = {}) => {
    const caption = hint(id, help);
    const common = {
      id,
      value: draft[id] as string,
      spellCheck: false,
      placeholder: options.placeholder,
      "aria-invalid": caption.invalid,
      "aria-describedby": caption.describedBy,
    } as const;
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="label-instr">
          {label}
        </label>
        {options.area ? (
          <textarea
            {...common}
            rows={3}
            onChange={(event) => patch({ [id]: event.target.value } as Partial<GeneratorDraft>)}
            className={`${inputClass} resize-y`}
          />
        ) : (
          <input
            {...common}
            type={options.url ? "url" : "text"}
            inputMode={options.url ? "url" : undefined}
            onChange={(event) => patch({ [id]: event.target.value } as Partial<GeneratorDraft>)}
            className={inputClass}
          />
        )}
        {caption.node}
      </div>
    );
  };

  const numberField = (id: keyof GeneratorDraft, label: string, help?: string) => {
    const caption = hint(id, help);
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="label-instr">
          {label}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft[id] as string}
          aria-invalid={caption.invalid}
          aria-describedby={caption.describedBy}
          onChange={(event) => patch({ [id]: event.target.value } as Partial<GeneratorDraft>)}
          className={`${inputBaseClass} w-32`}
        />
        {caption.node}
      </div>
    );
  };

  const primaryLabel = mustSignIn
    ? mode === "edit"
      ? dict.common.signIn
      : t.signInAndCreate
    : mode === "edit"
      ? t.save
      : t.create;

  // --- the sections of the form, one at a time in the inspector ---
  const sections: SectionDef[] = [
    {
      id: "version",
      title: t.versionHeading,
      help: t.versionHelp,
      content: (
        <div className="flex flex-col gap-3">
          <Segmented
            label={t.versionHeading}
            value={draft.version}
            onChange={(version) => patch({ version })}
            options={GENERATOR_VERSIONS.map((version) => ({ value: version, label: version }))}
          />
          {laterGroups.length > 0 && (
            <p className="type-caption text-fg-muted">
              {t.laterVersions} —{" "}
              {laterGroups.map((group, index) => (
                <span key={group.since}>
                  {index > 0 && " · "}
                  <MacroText text={t.sinceVersion.replace("{version}", `\`${group.since}\``)} />:{" "}
                  {group.features.join(", ")}
                </span>
              ))}
            </p>
          )}
          {excludedText && (
            <Notice tone="info">
              <MacroText text={t.excludedNotice.replace("{version}", draft.version).replace("{list}", excludedText)} />
            </Notice>
          )}
        </div>
      ),
    },
    {
      id: "basics",
      title: t.basicsHeading,
      content: (
        <>
          {text("adTitle", t.adTitle, t.adTitleHelp)}
          {text("name", t.name, t.nameHelp)}
          {text("description", t.description, undefined, { area: true })}
          {supports(draft.version, "advertiser") && text("advertiser", t.advertiser)}
        </>
      ),
    },
    {
      id: "video",
      title: t.videoHeading,
      content: (
        <MediaSourceField
          kind="video"
          id="media"
          label={t.videoLabel}
          help={t.videoHelp}
          value={draft.media}
          onChange={(media) => patch({ media })}
          signedIn={signedIn}
          onSignIn={goSignIn}
          error={fieldErrors.get("media")}
        />
      ),
    },
    {
      id: "click",
      title: t.clickHeading,
      content: text("clickThroughUrl", t.clickThrough, t.clickThroughHelp, {
        url: true,
        placeholder: "https://advertiser.example/landing?click={click_id}",
      }),
    },
    ...(supports(draft.version, "skip")
      ? [
          {
            id: "skip",
            title: t.skipHeading,
            content: (
              <>
                <Segmented
                  label={t.skipHeading}
                  value={draft.skip}
                  onChange={(skip) => patch({ skip })}
                  options={[
                    { value: "off", label: t.skipOff },
                    { value: "on", label: t.skipOn },
                  ]}
                />
                {draft.skip === "on" && numberField("skipSeconds", t.skipAfter)}
              </>
            ),
          },
        ]
      : []),
    {
      id: "tracking",
      title: t.trackingHeading,
      content: (
        <>
          <div className="flex flex-col gap-2">
            <HelpLabel label={t.ourTrackers} help={t.ourTrackersHelp} />
            <p className="data-instr type-caption text-fg-secondary">{ourTrackers.join(" · ")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label-instr">{t.pixels}</span>
            {/* The rules a URL must meet, in view rather than behind a tooltip:
                the user acts on them (§6, "Help tooltip"). */}
            <p className="type-caption text-fg-muted">
              <MacroText text={t.pixelsHelp} />
            </p>
            <PixelRows
              pixels={draft.pixels}
              offered={offeredPixels}
              onChange={(pixels) => patch({ pixels })}
              errors={fieldErrors}
            />
          </div>
        </>
      ),
    },
    {
      id: "companions",
      title: t.companionsHeading,
      content: (
        <>
          {/* The cap is a limit the user meets, so it is in view (§6). */}
          <p className="type-caption text-fg-muted">{t.companionsHelp}</p>
          {draft.companions.map((companion, index) => {
            const key = (name: string) => `companion:${companion.key}:${name}`;
            return (
              <Panel key={companion.key} className="flex flex-col gap-4 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="label-instr">
                    {t.companion.replace("{n}", String(index + 1))}
                    {companion.width && companion.height ? ` · ${companion.width}×${companion.height}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      update((current) => ({
                        companions: current.companions.filter((other) => other.key !== companion.key),
                      }))
                    }
                    className={buttonClass("ghost", "sm")}
                  >
                    {t.removeCompanion}
                  </button>
                </div>
                <MediaSourceField
                  kind="image"
                  id={key("image")}
                  label={t.companionImage}
                  help={t.imageHelp}
                  value={companion.image}
                  onChange={(image) =>
                    updateCompanion(companion.key, {
                      image,
                      // The banner's size defaults to the picture's own.
                      ...(image?.width && image.height ? { width: String(image.width), height: String(image.height) } : {}),
                    })
                  }
                  signedIn={signedIn}
                  onSignIn={goSignIn}
                  error={fieldErrors.get(key("image"))}
                />
                <div className="flex flex-wrap gap-4">
                  {(["width", "height"] as const).map((side) => {
                    const caption = hint(key(side));
                    return (
                      <div key={side} className="flex flex-col gap-2">
                        <label htmlFor={key(side)} className="label-instr">
                          {t[side]}
                        </label>
                        <input
                          id={key(side)}
                          type="text"
                          inputMode="numeric"
                          value={companion[side]}
                          aria-invalid={caption.invalid}
                          aria-describedby={caption.describedBy}
                          onChange={(event) => updateCompanion(companion.key, { [side]: event.target.value })}
                          className={`${inputBaseClass} w-28`}
                        />
                        {caption.node}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor={key("altText")} className="label-instr">
                    {t.companionAlt}
                  </label>
                  <input
                    id={key("altText")}
                    type="text"
                    value={companion.altText}
                    onChange={(event) => updateCompanion(companion.key, { altText: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </Panel>
            );
          })}
          {draft.companions.length < LIMITS.companions && (
            <button
              type="button"
              onClick={() => update((current) => ({ companions: [...current.companions, emptyCompanion()] }))}
              className={`${buttonClass("secondary", "sm")} self-start`}
            >
              {t.addCompanion}
            </button>
          )}
          {companionsOn &&
            text("companionClickThroughUrl", t.companionClickThrough, t.companionClickThroughHelp, { url: true })}
        </>
      ),
    },
    ...(supports(draft.version, "icon")
      ? [
          {
            id: "icon",
            title: t.iconHeading,
            content: (
              <>
                <Segmented
                  label={t.iconHeading}
                  value={draft.icon}
                  onChange={(icon) => patch({ icon })}
                  options={[
                    { value: "off", label: t.iconOff },
                    { value: "on", label: t.iconOn },
                  ]}
                />
                {draft.icon === "on" && (
                  <>
                    {text("iconProgram", t.iconProgram)}
                    <MediaSourceField
                      kind="image"
                      id="iconImage"
                      label={t.iconImage}
                      help={t.imageHelp}
                      value={draft.iconImage}
                      onChange={(iconImage) =>
                        patch({
                          iconImage,
                          ...(iconImage?.width && iconImage.height
                            ? { iconWidth: String(iconImage.width), iconHeight: String(iconImage.height) }
                            : {}),
                        })
                      }
                      signedIn={signedIn}
                      onSignIn={goSignIn}
                      error={fieldErrors.get("iconImage")}
                    />
                    <div className="flex flex-wrap gap-4">
                      {numberField("iconWidth", t.width)}
                      {numberField("iconHeight", t.height)}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="label-instr">{t.iconCorner}</span>
                      <Segmented
                        label={t.iconCorner}
                        wrap
                        value={draft.iconCorner}
                        onChange={(iconCorner: Corner) => patch({ iconCorner })}
                        options={(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => ({
                          value: corner,
                          label: t.corners[corner],
                        }))}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {numberField("iconOffsetSeconds", t.iconOffset)}
                      {numberField("iconDurationSeconds", t.iconDuration, t.iconDurationHelp)}
                    </div>
                    {text("iconClickThroughUrl", t.iconClickThrough, t.iconClickThroughHelp, { url: true })}
                  </>
                )}
              </>
            ),
          },
        ]
      : []),
    ...(supports(draft.version, "omid")
      ? [
          {
            id: "omid",
            title: t.omidHeading,
            content: (
              <>
                <Segmented
                  label={t.omidHeading}
                  value={draft.omid}
                  onChange={(omid) => patch({ omid })}
                  options={[
                    { value: "off", label: t.omidOff },
                    { value: "on", label: t.omidOn },
                  ]}
                />
                {draft.omid === "on" && (
                  <>
                    {text("omidVendor", t.omidVendor, t.omidVendorHelp)}
                    {text("omidScriptUrl", t.omidScript, undefined, { url: true, placeholder: "https://" })}
                    {text("omidParameters", t.omidParameters, t.omidParametersHelp, { area: true })}
                  </>
                )}
              </>
            ),
          },
        ]
      : []),
    ...(supports(draft.version, "universalAdId")
      ? [
          {
            id: "uaid",
            title: t.uaidHeading,
            content: (
              <>
                <Segmented
                  label={t.uaidHeading}
                  value={draft.uaid}
                  onChange={(uaid) => patch({ uaid })}
                  options={[
                    { value: "auto", label: t.uaidAuto },
                    { value: "custom", label: t.uaidCustom },
                  ]}
                />
                {draft.uaid === "custom" ? (
                  <div className="flex flex-col gap-4">
                    {text("uaidRegistry", t.uaidRegistry, undefined, { placeholder: "ad-id.org" })}
                    {text("uaidValue", t.uaidValue)}
                  </div>
                ) : (
                  <p className="type-caption text-fg-muted">
                    <MacroText text={t.uaidAutoHelp} />
                  </p>
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  // A section is marked only when something in it is wrong — a rail on every row
  // would teach the reader that the rail means nothing (§6).
  const errorSections = new Set([...fieldErrors.keys()].map(sectionOf));
  const navSections: NavSection[] = sections.map((section) => {
    const wrong = errorSections.has(section.id);
    return {
      id: section.id,
      label: section.title,
      tone: wrong ? "dead" : undefined,
      status: wrong ? t.sectionError : undefined,
    };
  });
  const showNotice = Boolean(
    serverError || looseIssues.length > 0 || (attempted && clientIssues.length > 0),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-dvh lg:flex-none">
      {heading && <h1 className="sr-only">{heading}</h1>}
      {bar}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <OutlineNav
          label={t.sections}
          sections={navSections}
          activeId={active.id}
          onSelect={setActiveId}
        />

        <section className="flex min-w-0 flex-col bg-surface p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-8 lg:py-6">
          {/* Colour owns a wide monitor, not the measure of the text (§5): the well
              and the lines under it stop at the default width and are centred. */}
          <div className="mx-auto flex w-full max-w-default flex-col gap-4">
            {notice}
            {restored && (
              <div className="flex flex-wrap items-center gap-3">
                <Notice tone="info">{t.draftRestored}</Notice>
                <button
                  type="button"
                  onClick={() => {
                    clearDraft();
                    setEdited(initialDraft);
                    setAttempted(false);
                  }}
                  className={buttonClass("ghost", "sm")}
                >
                  {t.startOver}
                </button>
              </div>
            )}

            <Segmented
              className="self-start"
              label={t.stageView}
              value={view}
              onChange={setView}
              options={[
                { value: "player", label: t.viewPlayer },
                { value: "xml", label: t.viewXml },
              ]}
            />

            {view === "player" ? (
              <div className="flex flex-col gap-3">
                <WellFrame strip={<span className="chip-instr text-well-fg">VAST {draft.version} · LINEAR</span>}>
                  {runToken > 0 && runIsCurrent ? (
                    <ValidatorStage
                      key={runToken}
                      runToken={runToken}
                      playback={report?.playback ?? null}
                      contentSrc={INSTREAM_CONTENT_SRC}
                      onEvent={onEvent}
                      onAdResolved={() => {}}
                      onUnavailable={() => setSandboxMissing(true)}
                    />
                  ) : (
                    <WellIdle>{!xml ? t.wellNeedsMedia : ranXml !== null ? t.runStale : t.wellIdle}</WellIdle>
                  )}
                </WellFrame>
                <Button type="button" onClick={() => void run()} disabled={!xml || running} className="self-start">
                  {running ? `${t.playing}…` : t.play}
                </Button>
                {runError && (
                  <p role="alert" className="flex items-center gap-2 type-small text-dead">
                    <AlertCircle aria-hidden className="size-4 shrink-0" />
                    {runError}
                  </p>
                )}
                {report && runIsCurrent && (
                  <>
                    <DegradedNotice report={report} />
                    <VerdictStrip report={report} />
                  </>
                )}
                {/* After the verdict: these notices speak of "the report above". */}
                {sandboxMissing && <Notice tone="dead">{tv.sandboxUnavailable}</Notice>}
                {unplayable && <Notice tone="warn">{tv.playerUnavailable}</Notice>}
                {sdkBlocked && (
                  <Notice tone="info" live detail={IMA_SDK_SRC}>
                    {tv.sdkBlocked}
                  </Notice>
                )}
              </div>
            ) : xml ? (
              <div className="flex flex-col gap-2">
                <p className="type-caption text-fg-muted">{t.xmlCaption}</p>
                {/* A scroll box is reachable by keyboard, or its overflow is not
                    reachable at all; a region, so its name is announced. */}
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label={t.xmlHeading}
                  className="max-h-128 overflow-auto rounded-panel border border-hairline bg-ground p-4 type-data text-fg-secondary"
                >
                  {xml}
                </pre>
              </div>
            ) : (
              <p className="type-small text-fg-muted">
                {draft.adTitle.trim() && draft.media ? t.xmlBlocked : t.xmlIncomplete}
              </p>
            )}

            {report && runIsCurrent && <Recommendations findings={report.findings} />}
          </div>
        </section>

        <div className="flex min-w-0 flex-col border-hairline lg:min-h-0 lg:w-[340px] lg:shrink-0 lg:border-l">
          {/* Below `lg` the outline is a row of chips above the inspector. */}
          <SectionChips
            label={t.sections}
            sections={navSections}
            activeId={active.id}
            onSelect={setActiveId}
          />
          {/* The section's name is a heading at every width and drawn only from `lg`:
              below it the chip is the name, and a section's explanation — which has
              nowhere else to be — leads the fields. */}
          <h2 className="sr-only lg:hidden">{active.title}</h2>
          <div className="hidden h-12 shrink-0 items-center border-b border-hairline px-5 lg:flex">
            <h2 className="type-body font-medium">
              {active.help ? (
                <HelpLabel label={active.title} help={active.help} className="type-body font-medium" />
              ) : (
                active.title
              )}
            </h2>
          </div>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <input type="hidden" name="config" value={configJson} />
            <input type="hidden" name="name" value={draft.name} />
            {creativeId && <input type="hidden" name="creative_id" value={creativeId} />}

            <div className="relative flex flex-col gap-4 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {active.help && (
                <div className="lg:hidden">
                  <HelpLabel label={active.title} help={active.help} className="type-body font-medium" />
                </div>
              )}
              {active.content}
            </div>

            {/* The foot. From `lg` it is a footer under the scroller. Below it only
                the buttons stay at the foot of the screen: the notice and the note
                scroll with the section, since between them they took a quarter of a
                phone's height for good (§6, "Workspace"). */}
            <div className="flex flex-col gap-3 border-t border-hairline p-5 max-lg:contents">
              {showNotice && (
                <div ref={noticeRef} className="max-lg:px-5">
                  <Notice tone="dead" live>
                    <MacroText text={[serverError ?? t.fixErrors, ...looseIssues].join(" ")} />
                  </Notice>
                </div>
              )}
              <div className="workspace-strip flex flex-wrap items-center gap-3 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:border-t max-lg:border-hairline max-lg:bg-ground max-lg:p-4">
                {/* The one primary on the page — the whole accent budget (§3, §6 "Free tools"). */}
                {mustSignIn ? (
                  <Button variant="primary" type="button" onClick={signInToCreate}>
                    {primaryLabel}
                  </Button>
                ) : (
                  <Button variant="primary" type="submit" disabled={pending}>
                    {pending ? `${t.saving}…` : primaryLabel}
                  </Button>
                )}
                {cancelHref && (
                  <Link href={cancelHref} className={buttonClass("ghost", "md")}>
                    {t.cancel}
                  </Link>
                )}
              </div>
              {!signedIn && mode === "create" && (
                <p className="type-caption text-fg-muted max-lg:px-5 max-lg:pb-5">{t.signInNote}</p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
