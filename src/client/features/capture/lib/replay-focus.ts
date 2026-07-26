import type { eventWithTime, playerConfig } from "rrweb";
import { Replayer, ReplayerEvents } from "rrweb";

/**
 * A replay is a real document with real controls, so left alone its buttons and
 * fields join the review's tab order and its accessibility tree. `inert` on the
 * iframe takes them out of both.
 *
 * It does not reach into the nested document, though, and rrweb replays the
 * recorded focus events — which is the point, the focus ring is part of what was
 * captured. Once focus is in there Tab walks the captured page's own controls,
 * so leaving is handled by hand: it lands on the capture the replay sits in,
 * which is where a reader tabbing past it should carry on from.
 */
export function sealedReplayer(
  events: readonly eventWithTime[],
  config: Partial<playerConfig>
): Replayer {
  const replayer = new Replayer(events as eventWithTime[], config);

  replayer.iframe.inert = true;

  function leave(event: KeyboardEvent) {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    replayer.iframe.closest<HTMLElement>("[tabindex]")?.focus();
  }

  // Rebound on every rebuild, since a document rebuilt in place drops the
  // listeners registered on it. Rebinding one that survived is a no-op.
  function guard() {
    replayer.iframe.contentDocument?.addEventListener("keydown", leave);
  }

  guard();
  replayer.on(ReplayerEvents.FullsnapshotRebuilded, guard);

  return replayer;
}
