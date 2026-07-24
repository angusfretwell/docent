/**
 * Branded, prefix-refined record ids for `.docent/` records. Each id is a
 * nominal `string` brand whose decode refinement pins the `<prefix>_` head its
 * minter stamps (`core/store/id.ts` for the ULID-shaped ids;
 * `core/findings-write.ts#mintChange` for the sequential `chg_NNN`), so a
 * `FindingId` can never be passed where a `WalkthroughId` is wanted and a
 * mis-prefixed value fails to decode. Runtime-neutral: no Bun or DOM globals,
 * shared by the server (which parses record files off disk) and the client
 * (which folds and renders them).
 *
 * The refinement checks the **prefix**, not the full minted body: it validates
 * the `<prefix>_` head plus a non-empty, whitespace-free tail, and no more. Ids
 * are hand-authorable (walkthroughs.md §10) and appear short and underscored in
 * fixtures (`fnd_actioned_change`), and the Change id is sequential (`chg_001`)
 * rather than a 26-char Crockford ULID — a stricter length/alphabet check would
 * reject legitimate ids and, because the best-effort read path runs this check
 * through `.make`, would turn a survivable id into a fatal parse.
 */

import { Schema } from "effect";

/** A `string` schema refined to the `<prefix>_…` head and tagged with `brand`. */
function brandedId<const Brand extends string>(brand: Brand, prefix: string) {
  return Schema.String.check(
    Schema.isPattern(new RegExp(`^${prefix}_\\S+$`))
  ).pipe(Schema.brand(brand));
}

/** `docent/change` id — sequential per Review (`chg_001`, `chg_002`, …). */
export const ChangeId = brandedId("ChangeId", "chg");
export type ChangeId = typeof ChangeId.Type;

/** `docent/finding` record-dir id (`fnd_…`). */
export const FindingId = brandedId("FindingId", "fnd");
export type FindingId = typeof FindingId.Type;

/** `docent/walkthrough` manifest id (`wlk_…`). */
export const WalkthroughId = brandedId("WalkthroughId", "wlk");
export type WalkthroughId = typeof WalkthroughId.Type;

/** `docent/walkthrough-section` id (`sec_…`). */
export const SectionId = brandedId("SectionId", "sec");
export type SectionId = typeof SectionId.Type;

/** A product walkthrough's `captures[]` registry-entry id (`cap_…`). */
export const CaptureId = brandedId("CaptureId", "cap");
export type CaptureId = typeof CaptureId.Type;

/** `docent/review` identity-record id (`rev_…`). */
export const ReviewId = brandedId("ReviewId", "rev");
export type ReviewId = typeof ReviewId.Type;
