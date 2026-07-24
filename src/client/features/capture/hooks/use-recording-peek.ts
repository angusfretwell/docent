import { useCallback, useEffect, useRef } from "react";

import type { TimePin } from "../lib/pins";
import { usePinFocus, usePinHovered } from "./use-pin-hover";
import type { RrwebReplayer } from "./use-rrweb-replayer";

/** How long a pointer settles on a callout before the replay answers it. */
const PEEK_DWELL_MS = 200;

/** Where the transport would be found had nothing borrowed it. */
interface PeekResume {
  currentMs: number;
  playing: boolean;
}

/**
 * Hovering a recording's callout has the replay demonstrate it: a span loops
 * within itself, a bare timestamp holds on its frame. The transport is borrowed
 * rather than seized — where the playhead was and whether it was running are
 * given back when the pointer leaves, so brushing past a callout on the way down
 * the prose cannot cost a reader their place. A dwell keeps a pointer merely
 * passing through from yanking the playhead at all.
 *
 * Clicking commits instead. The focus request the screenshot arm reads as "frame
 * this region" reads here as "keep me here", and the restore is abandoned — and
 * where the click arrived from another capture's callout, with no dwell to have
 * borrowed the transport in the first place, it does the demonstrating itself.
 */
export function useRecordingPeek(
  replay: RrwebReplayer,
  pins: readonly TimePin[],
  target: string | undefined
) {
  const { currentMs, pause, play, playing, ready, seek, setLoop } = replay;

  const hovered = usePinHovered();
  const focused = usePinFocus();

  const peekRef = useRef<{ committed: boolean; resume: PeekResume } | null>(
    null
  );
  const resumeRef = useRef<PeekResume>({ currentMs: 0, playing: false });

  /* Frozen for the duration of a peek: the loop drives the playhead itself, so
     tracking it through one would overwrite the very position to give back. */
  useEffect(() => {
    if (peekRef.current === null) {
      resumeRef.current = { currentMs, playing };
    }
  });

  const release = useCallback(() => {
    const peek = peekRef.current;

    if (peek === null) {
      return;
    }

    peekRef.current = null;

    if (peek.committed) {
      return;
    }

    setLoop(undefined);

    /* `seek` keeps play/pause as it finds it, so the resumed state has to be in
       place before the playhead moves — otherwise a peek that paused would seek
       the reader's position and leave it stranded there. */
    if (peek.resume.playing) {
      seek(peek.resume.currentMs);
      play();
    } else {
      pause();
      seek(peek.resume.currentMs);
    }
  }, [pause, play, seek, setLoop]);

  const engage = useCallback(
    (atMs: number, toMs: number | undefined) => {
      peekRef.current ??= { committed: false, resume: resumeRef.current };

      if (toMs === undefined) {
        setLoop(undefined);
        pause();
        seek(atMs);
        return;
      }

      setLoop([atMs, toMs]);
      seek(atMs);
      play();
    },
    [pause, play, seek, setLoop]
  );

  /* Keyed on the offsets rather than the pin, which is rebuilt on every render:
     depending on its identity would restart the dwell before it ever elapsed. */
  const pin =
    hovered === undefined || hovered.target !== target
      ? undefined
      : pins.find((candidate) => candidate.label === hovered.label);
  const atMs = pin?.atMs;
  const toMs = pin?.toMs;

  useEffect(() => {
    if (atMs === undefined) {
      release();
      return;
    }

    const dwell = setTimeout(() => engage(atMs, toMs), PEEK_DWELL_MS);

    return () => clearTimeout(dwell);
  }, [atMs, engage, release, toMs]);

  const served = useRef(-1);

  useEffect(() => {
    if (focused === undefined || focused.nonce === served.current) {
      return;
    }

    if (focused.key.target !== target) {
      return;
    }

    // Nothing can be demonstrated on a transport that has no recording behind it
    // yet, so the request stands until the replay is loaded.
    if (!ready) {
      return;
    }

    served.current = focused.nonce;

    // Clicking a callout of a recording that wasn't on the panel brings it on
    // with no pointer ever having reached it, so the request does the seeking a
    // dwell would otherwise have done.
    if (peekRef.current === null) {
      const asked = pins.find(
        (candidate) => candidate.label === focused.key.label
      );

      if (asked === undefined) {
        return;
      }

      engage(asked.atMs, asked.toMs);
    }

    const peek = peekRef.current;

    if (peek !== null) {
      peek.committed = true;
    }
  }, [engage, focused, pins, ready, target]);
}
