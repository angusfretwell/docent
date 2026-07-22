/**
 * A still frame of a captured page, reconstructed as live DOM rather than
 * decoded from a raster (walkthroughs.md §6). A screenshot capture's blob holds
 * the `[Meta, FullSnapshot]` pair that opens any rrweb recording, and rrweb's
 * `Replayer` rebuilds the first full snapshot as soon as it is constructed — so
 * a still needs no transport at all, only a mount. Text stays vector-sharp at
 * any zoom, which a PNG cannot do.
 *
 * The replay iframe is sized to the capture's full-page `dims` rather than left
 * at the recorded window height: the snapshot holds the whole document, and a
 * still frame is read as the whole page. rrweb sizes the iframe by *attribute*,
 * so the inline style set here wins without racing its resize handling.
 */

import { captureEventsQuery } from "@client/features/product-walkthrough/captures";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer } from "rrweb";

export interface RrwebSnapshot {
  /** Whether the event stream failed to load. */
  failed: boolean;
  /** Whether the snapshot has loaded and been mounted. */
  ready: boolean;
  /** Mount point the snapshot's DOM is reconstructed into. */
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Fetch a capture's rrweb snapshot and rebuild it on the returned ref.
 *
 * @param dims - the captured page's full size in CSS pixels, `[width, height]`.
 */
export function useRrwebSnapshot(
  walkthroughId: string,
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
