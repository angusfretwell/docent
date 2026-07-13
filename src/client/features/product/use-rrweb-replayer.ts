/**
 * A self-contained rrweb replay of a recording capture (walkthroughs.md §6):
 * reads the event stream from its content-addressed blob query (the cache
 * holds only the fetched event array — never the `Replayer`) and drives an
 * rrweb `Replayer` mounted on the returned `rootRef`, with no network beyond
 * that one fetch. `seek` plays the replay from a given millisecond offset;
 * `ready`/`failed` gate the timeline controls and the load-failure note.
 */

import { captureEventsQuery } from "@client/data/blobs";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Replayer } from "rrweb";
import type { eventWithTime } from "rrweb";

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

  const events = useQuery(captureEventsQuery(url));
  const eventStream = events.data;

  useEffect(() => {
    if (eventStream === undefined || rootRef.current === null) {
      return;
    }

    const replayer = new Replayer(eventStream as eventWithTime[], {
      mouseTail: false,
      root: rootRef.current,
      skipInactive: false,
      speed: 1,
    });
    replayerRef.current = replayer;
    setReady(true);

    return () => {
      replayer.destroy();
      replayerRef.current = null;
    };
  }, [eventStream]);

  function seek(ms: number) {
    replayerRef.current?.play(ms);
  }

  return { failed: events.isError, ready, rootRef, seek };
}
