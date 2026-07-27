/**
 * The bundle `docent rrweb` emits. The driver injects it by `eval`, which has no
 * module scope, so the recorder is published on the page's global the way
 * rrweb's own UMD build does — that build is unreachable through the package's
 * exports map, and bundling from the package entry pins the recorder to the
 * same rrweb the Replayer renders with.
 */

import { record } from "rrweb";

declare global {
  // eslint-disable-next-line no-var
  var rrweb: { record: typeof record };
}

globalThis.rrweb = { record };
