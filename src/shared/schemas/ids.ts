/**
 * Each id is a nominal `string` brand whose refinement checks only the `<prefix>_`
 * head plus a non-empty, whitespace-free tail — not the full minted body. Ids are
 * hand-authorable and the Change id is sequential (`chg_001`), not a ULID, so a
 * stricter length/alphabet check would reject legitimate ids and turn a survivable
 * id into a fatal parse on the best-effort read path.
 */

import { Schema } from "effect";

function brandedId<const Brand extends string>(brand: Brand, prefix: string) {
  return Schema.String.check(
    Schema.isPattern(new RegExp(`^${prefix}_\\S+$`))
  ).pipe(Schema.brand(brand));
}

export const ChangeId = brandedId("ChangeId", "chg");
export type ChangeId = typeof ChangeId.Type;

export const FindingId = brandedId("FindingId", "fnd");
export type FindingId = typeof FindingId.Type;

export const WalkthroughId = brandedId("WalkthroughId", "wlk");
export type WalkthroughId = typeof WalkthroughId.Type;

export const SectionId = brandedId("SectionId", "sec");
export type SectionId = typeof SectionId.Type;

export const CaptureId = brandedId("CaptureId", "cap");
export type CaptureId = typeof CaptureId.Type;

export const ReviewId = brandedId("ReviewId", "rev");
export type ReviewId = typeof ReviewId.Type;
