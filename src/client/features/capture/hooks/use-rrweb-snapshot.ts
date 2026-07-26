import { useResolvedTheme } from "@client/components/theme-provider";
import { captureEventsQuery } from "@client/queries/captures";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer } from "rrweb";

import { sealReplay } from "../lib/replay-focus";
import { holdReplayScheme } from "../lib/replay-scheme";

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
    sealReplay(replayer);
    setReady(true);

    return () => {
      replayer.destroy();
      replayerRef.current = null;
      setReady(false);
    };
  }, [eventStream, height, width]);

  useEffect(() => {
    const replayer = replayerRef.current;

    if (!ready || replayer === null) {
      return;
    }

    return holdReplayScheme(replayer, scheme);
  }, [ready, scheme]);

  return { failed: events.isError, ready, rootRef };
}
