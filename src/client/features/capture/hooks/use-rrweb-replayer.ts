import { useResolvedTheme } from "@client/components/theme-provider";
import { captureEventsQuery } from "@client/queries/captures";
import type { WalkthroughId } from "@shared/schemas/ids";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer, ReplayerEvents } from "rrweb";

import { sealReplay } from "../lib/replay-focus";
import { holdReplayScheme } from "../lib/replay-scheme";

export interface RrwebReplayer {
  currentMs: number;
  /** 0 until the recording has loaded. */
  durationMs: number;
  failed: boolean;
  pause: () => void;
  /** Restarts from the top if the playhead sits at the end. */
  play: () => void;
  playing: boolean;
  ready: boolean;
  repeat: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** Keeps play/pause as it is. */
  seek: (ms: number) => void;
  /** Confine playback to a span, looping within it; `undefined` frees the playhead. */
  setLoop: (span: readonly [number, number] | undefined) => void;
  setRepeat: (repeat: boolean) => void;
}

const LOOP_HOLD_MS = 1000;

function clamp(ms: number, durationMs: number) {
  return Math.max(0, Math.min(ms, durationMs));
}

export function useRrwebReplayer(
  walkthroughId: WalkthroughId,
  media: string
): RrwebReplayer {
  const rootRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const scheme = useResolvedTheme();

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [repeat, setRepeat] = useState(true);

  /* `playing` as it stands now, not as the last render saw it: a handler that
     pauses then seeks would otherwise read the pre-pause state and resume under
     the drag. */
  const playingRef = useRef(false);

  const setPlayingState = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  /* `repeat` as it stands now, for the end-of-lap beat to read when it wakes:
     turning repeat off during the beat must stop the recording there. */
  const repeatRef = useRef(true);

  const setRepeatState = useCallback((next: boolean) => {
    repeatRef.current = next;
    setRepeat(next);
  }, []);

  /* rrweb's `getCurrentTime()` is only meaningful once playback has started — it
     is measured against a `baselineTime` that begins at 0, so before the first
     `play()` it reports minus the first event's timestamp. The playhead is
     tracked here instead. */
  const currentMsRef = useRef(0);

  const setPosition = useCallback((ms: number) => {
    currentMsRef.current = ms;
    setCurrentMs(ms);
  }, []);

  /* Held in a ref, not state: the frame loop reads it every tick, and rebuilding
     that effect each time a callout narrowed or freed the span would restart the
     loop under the reader. */
  const loopRef = useRef<readonly [number, number] | null>(null);

  /* Spans are often well under a second, so without a beat bracketing each end
     of a lap they read as a strobe rather than one thing happening repeatedly. */
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = useCallback(() => {
    if (holdRef.current !== null) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  }, []);

  const setLoop = useCallback(
    (span: readonly [number, number] | undefined) => {
      loopRef.current = span ?? null;
      clearHold();
    },
    [clearHold]
  );

  /**
   * The replayer is paused through both beats but `playing` is left alone:
   * flipping it each lap would flicker the control and stop the frame loop that
   * has to notice the lap ran out.
   */
  const restartLoop = useCallback(
    (fromMs: number) => {
      if (holdRef.current !== null) {
        return;
      }

      const scheduledUnder = loopRef.current;

      function stillWanted() {
        return (
          playingRef.current &&
          loopRef.current === scheduledUnder &&
          (scheduledUnder !== null || repeatRef.current)
        );
      }

      replayerRef.current?.pause();

      holdRef.current = setTimeout(() => {
        holdRef.current = null;

        if (!stillWanted()) {
          return;
        }

        setPosition(fromMs);
        replayerRef.current?.pause(fromMs);

        holdRef.current = setTimeout(() => {
          holdRef.current = null;

          if (stillWanted()) {
            replayerRef.current?.play(fromMs);
          }
        }, LOOP_HOLD_MS);
      }, LOOP_HOLD_MS);
    },
    [setPosition]
  );

  const events = useQuery(captureEventsQuery(walkthroughId, media));
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
    sealReplay(replayer);

    setPosition(0);
    setDurationMs(replayer.getMetaData().totalTime);
    setReady(true);

    /* Runs on arrival: a still first frame reads as a broken image rather than
       something waiting to be asked. */
    replayer.play(0);
    setPlayingState(true);

    return () => {
      clearHold();
      replayer.destroy();
      replayerRef.current = null;
      setReady(false);
    };
  }, [clearHold, eventStream, setPlayingState, setPosition]);

  useEffect(() => {
    const replayer = replayerRef.current;

    if (!ready || replayer === null) {
      return;
    }

    return holdReplayScheme(replayer, scheme);
  }, [ready, scheme]);

  useEffect(() => {
    const replayer = replayerRef.current;

    if (!ready || replayer === null) {
      return;
    }

    function handleFinish() {
      /* A span that reaches the recording's end runs out here, not in the frame
         loop, so it restarts in place — a confined playhead must not escape to
         the top. */
      const span = loopRef.current;

      if (span !== null) {
        restartLoop(span[0]);
        setPosition(span[1]);
        return;
      }

      if (repeat) {
        restartLoop(0);
        setPosition(durationMs);
        return;
      }

      setPosition(durationMs);
      setPlayingState(false);
    }

    replayer.on(ReplayerEvents.Finish, handleFinish);

    return () => {
      replayer.off(ReplayerEvents.Finish, handleFinish);
    };
  }, [durationMs, ready, repeat, restartLoop, setPlayingState, setPosition]);

  /* rrweb exposes the playhead only by polling `getCurrentTime()` — no progress
     event to subscribe to — so the scrubber runs off a frame loop while the
     replay does. */
  useEffect(() => {
    if (!playing) {
      return;
    }

    let frame = 0;

    function tick() {
      const replayer = replayerRef.current;

      if (replayer !== null) {
        const position = clamp(replayer.getCurrentTime(), durationMs);
        const span = loopRef.current;

        if (span !== null && position >= span[1]) {
          restartLoop(span[0]);
          setPosition(span[1]);
        } else {
          setPosition(position);
        }
      }

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [durationMs, playing, restartLoop, setPosition]);

  const play = useCallback(() => {
    const replayer = replayerRef.current;

    if (replayer === null) {
      return;
    }

    const from =
      currentMsRef.current >= durationMs
        ? 0
        : clamp(currentMsRef.current, durationMs);

    setPosition(from);
    replayer.play(from);
    setPlayingState(true);
  }, [durationMs, setPlayingState, setPosition]);

  const pause = useCallback(() => {
    replayerRef.current?.pause();
    setPlayingState(false);
  }, [setPlayingState]);

  const seek = useCallback(
    (ms: number) => {
      const replayer = replayerRef.current;

      if (replayer === null) {
        return;
      }

      const offset = clamp(ms, durationMs);

      if (playingRef.current) {
        replayer.play(offset);
      } else {
        replayer.pause(offset);
      }

      setPosition(offset);
    },
    [durationMs, setPosition]
  );

  return {
    currentMs,
    durationMs,
    failed: events.isError,
    pause,
    play,
    playing,
    ready,
    repeat,
    rootRef,
    seek,
    setLoop,
    setRepeat: setRepeatState,
  };
}
