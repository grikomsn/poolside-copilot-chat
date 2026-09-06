/**
 * Vetted inline-completion model candidates, ordered cheap-and-fast first.
 *
 * Badges carry the live-measured (2026-09-06) latency and hidden-reasoning
 * results. The QuickPick command renders this list and writes the selected id
 * to `poolsideCopilot.inlineSuggestionsModel`, so choices need no reload.
 * Unknown model ids stay reachable through the command's custom entry and the
 * raw setting.
 *
 * Pure and unit-tested.
 */

export interface InlineModelCandidate {
  readonly id: string;
  /** Short measured/compatibility badge, e.g. "★ recommended · measured 0.4s TTFB". */
  readonly badge: string;
  /** One-line rationale shown under the model id. */
  readonly detail: string;
}

export const INLINE_MODEL_CANDIDATES: readonly InlineModelCandidate[] = [
  {
    id: "poolside/laguna-xs-2.1",
    badge: "★ recommended · measured 0.4s TTFB",
    detail: "Fastest measured model; requested with no thinking field because the explicit thinking-off switch perturbs its output quality.",
  },
  {
    id: "poolside/laguna-s-2.1",
    badge: "measured 0.8–1.8s TTFB",
    detail: "Zero hidden reasoning with the request-level thinking-off switch; larger-context alternate to the default.",
  },
];

export interface InlineModelChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly detail: string;
}

/** Build QuickPick-shaped choices, pinning an unlisted current id to the top. */
export function inlineModelChoices(currentId: string): InlineModelChoice[] {
  const listed = INLINE_MODEL_CANDIDATES.map((candidate) => ({
    id: candidate.id,
    label: candidate.id === currentId ? `$(check) ${candidate.id}` : candidate.id,
    description: candidate.badge,
    detail: candidate.detail,
  }));
  const pinned = !INLINE_MODEL_CANDIDATES.some((candidate) => candidate.id === currentId)
    ? [{
      id: currentId,
      label: `$(check) ${currentId}`,
      description: "current value",
      detail: "Kept from your settings; not in the vetted list.",
    }]
    : [];
  return [...pinned, ...listed];
}
