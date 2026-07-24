import { captureEventsQuery } from "@client/queries/captures";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer } from "rrweb";

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
  const [ready, setReady] = useState(false);
  const [width, height] = dims;

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

    // rrweb sizes the iframe by attribute, so the inline style set here wins
    // without racing its resize handling.
    replayer.iframe.style.width = `${width}px`;
    replayer.iframe.style.height = `${height}px`;
    setReady(true);

    return () => {
      replayer.destroy();
      setReady(false);
    };
  }, [eventStream, height, width]);

  return { failed: events.isError, ready, rootRef };
}
