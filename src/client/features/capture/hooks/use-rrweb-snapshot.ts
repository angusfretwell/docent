import { useResolvedTheme } from "@client/components/theme-provider";
import { captureEventsQuery } from "@client/queries/captures";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer } from "rrweb";

import { applyReplayScheme } from "../lib/replay-scheme";

export interface RrwebSnapshot {
  failed: boolean;
  ready: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/** @param dims - the captured page's full size in CSS pixels, `[width, height]`. */
export function useRrwebSnapshot(
  walkthroughId: WalkthroughId,
  media: string,
  dims: readonly [number, number]
): RrwebSnapshot {
  const rootRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const [ready, setReady] = useState(false);
  const [width, height] = dims;

  const scheme = useResolvedTheme();

  const events = useQuery(captureEventsQuery(walkthroughId, media));
  const eventStream = events.data;

  useEffect(() => {
    if (eventStream === undefined || rootRef.current === null) {
      return;
    }

    const replayer = new Replayer(eventStream as eventWithTime[], {
      mouseTail: false,
      root: rootRef.current,
      speed: 1,
    });
    replayerRef.current = replayer;

    // rrweb sizes the iframe by attribute, so the inline style set here wins
    // without racing its resize handling.
    replayer.iframe.style.width = `${width}px`;
    replayer.iframe.style.height = `${height}px`;
    applyReplayScheme(replayer.iframe, scheme);
    setReady(true);

    return () => {
      replayer.destroy();
      replayerRef.current = null;
      setReady(false);
    };
    // `scheme` is applied by the effect below, not a rebuild trigger.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [eventStream, height, width]);

  useEffect(() => {
    if (replayerRef.current !== null) {
      applyReplayScheme(replayerRef.current.iframe, scheme);
    }
  }, [scheme, ready]);

  return { failed: events.isError, ready, rootRef };
}
