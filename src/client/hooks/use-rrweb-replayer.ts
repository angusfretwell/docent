/**
 * A self-contained rrweb replay of a recording capture (walkthroughs.md §6):
 * fetches the event stream from its content-addressed blob and drives an
 * rrweb `Replayer` mounted on the returned `rootRef`, with no network beyond
 * that one fetch. `seek` plays the replay from a given millisecond offset;
 * `ready`/`failed` gate the timeline controls and the load-failure note.
 */

import { useEffect, useRef, useState } from "react";
import { Replayer } from "rrweb";
import type { eventWithTime } from "rrweb";

import { fetchCaptureEvents } from "../lib/blobs";

export interface RrwebReplayer {
  /** Mount point the replayer reconstructs the recorded DOM into. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the event stream has loaded and the replayer is mounted. */
  ready: boolean;
  /** Whether the event stream failed to load. */
  failed: boolean;
  /** Play the replay from the given millisecond offset. */
  seek: (ms: number) => void;
}

/** Fetch `url`'s rrweb event stream and drive a `Replayer` on the returned ref. */
export function useRrwebReplayer(url: string): RrwebReplayer {
  const rootRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let replayer: Replayer | null = null;
    fetchCaptureEvents(url)
      .then((events) => {
        if (cancelled || rootRef.current === null) {
          return;
        }
        replayer = new Replayer(events as eventWithTime[], {
          mouseTail: false,
          root: rootRef.current,
          skipInactive: false,
          speed: 1,
        });
        replayerRef.current = replayer;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      replayer?.destroy();
      replayerRef.current = null;
    };
  }, [url]);

  function seek(ms: number) {
    replayerRef.current?.play(ms);
  }

  return { failed, ready, rootRef, seek };
}
