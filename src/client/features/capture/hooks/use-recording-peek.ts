import { useCallback, useEffect, useRef } from "react";

import type { TimePin } from "../lib/pins";
import { usePinFocus, usePinHovered } from "./use-pin-hover";
import type { RrwebReplayer } from "./use-rrweb-replayer";

const PEEK_DWELL_MS = 200;

interface PeekResume {
  currentMs: number;
  playing: boolean;
}

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

  /* The loop drives the playhead during a peek, so tracking it then would
     overwrite the very position to give back. */
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

    /* `seek` keeps play/pause as it finds it, so the resumed state must be in
       place before the playhead moves. */
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

  /* Keyed on the offsets, not the pin object, which is rebuilt every render:
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

    // The request stands until the replay is loaded — nothing can be
    // demonstrated on a transport with no recording behind it yet.
    if (!ready) {
      return;
    }

    served.current = focused.nonce;

    // A click on a callout of a recording that wasn't on the panel brings it on
    // with no pointer having reached it, so it does the seeking a dwell would.
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
