/**
 * The browser's server SDK. One dot-discoverable `api` object over the Bun
 * server's routes; every module funnels through `client.ts` for the one shared
 * error shape (H6). Reach for `api.<domain>.<verb>(…)` — never `fetch`/`ky`
 * directly, and `EventSource` only via `api.events.subscribe`.
 */

import * as blob from "./blob";
import * as captures from "./captures";
import * as diff from "./diff";
import * as events from "./events";
import * as findings from "./findings";
import * as pending from "./pending";
import * as review from "./review";
import * as viewed from "./viewed";

export const api = {
  blob,
  captures,
  diff,
  events,
  findings,
  pending,
  review,
  viewed,
};
