/**
 * A self-contained rrweb replay of a recording capture (walkthroughs.md §6):
 * reads the event stream from its content-addressed blob query (the cache holds
 * only the fetched event array — never the `Replayer`) and drives an rrweb
 * `Replayer` mounted on the returned `rootRef`, with no network beyond that one
 * fetch. The transport controls — play/pause, scrub, repeat — are the whole of
 * the replay's public surface; `ready`/`failed` gate them and the load-failure
 * note. The replay starts itself once the stream is in and loops by default, so
 * a panel that mounts one is showing it rather than offering it.
 */

import { captureEventsQuery } from "@client/features/product-walkthrough/captures";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import { Replayer, ReplayerEvents } from "rrweb";

export interface RrwebReplayer {
  /** Playhead position in milliseconds from the start of the recording. */
  currentMs: number;
  /** Length of the recording in milliseconds, or 0 until it has loaded. */
  durationMs: number;
  /** Whether the event stream failed to load. */
  failed: boolean;
  /** Hold the playhead where it is. */
  pause: () => void;
  /** Run the replay from the playhead, restarting if it sits at the end. */
  play: () => void;
  /** Whether the replay is currently running. */
  playing: boolean;
  /** Whether the event stream has loaded and the replayer is mounted. */
  ready: boolean;
  /**
   * Whether reaching the end restarts the replay rather than stopping it,
   * resting on the last and first frames in between.
   */
  repeat: boolean;
  /** Mount point the replayer reconstructs the recorded DOM into. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** Move the playhead to a millisecond offset, keeping play/pause as it is. */
  seek: (ms: number) => void;
  /**
   * Confine playback to a span, restarting at its start each time it runs out —
   * the same loop `repeat` performs over the whole recording, narrowed to a
   * range and resting on each end frame alike. `undefined` frees the playhead to
   * the recording again.
   */
  setLoop: (span: readonly [number, number] | undefined) => void;
  /** Turn repeat on or off. */
  setRepeat: (repeat: boolean) => void;
}

/** How long a lap rests on each of its end frames before running again. */
const LOOP_HOLD_MS = 1000;

/** Hold a millisecond offset inside the recording. */
function clamp(ms: number, durationMs: number) {
  return Math.max(0, Math.min(ms, durationMs));
}

/** Fetch a capture's rrweb event stream and drive a `Replayer` on the returned ref. */
export function useRrwebReplayer(
  walkthroughId: string,
  media: string
): RrwebReplayer {
  const rootRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [repeat, setRepeat] = useState(true);

  /* `playing` as the replayer sees it right now, not as the last render saw it:
     a scrubber that pauses and then seeks within one handler would otherwise
     read the pre-pause state and resume playback under the drag. */
  const playingRef = useRef(false);

  const setPlayingState = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  /* `repeat` as it stands right now, for the beat at the end of a lap to read
     when it wakes: a reader who turns repeat off during the beat has asked for
     the recording to stop there. */
  const repeatRef = useRef(true);

  const setRepeatState = useCallback((next: boolean) => {
    repeatRef.current = next;
    setRepeat(next);
  }, []);

  /* The playhead is tracked here rather than read back from the replayer,
     because rrweb's `getCurrentTime()` is only meaningful once playback has
     started: it is measured against a `baselineTime` that begins life at 0, so
     before the first `play()` it reports minus the first event's epoch
     timestamp. Resuming from that value seeks to a nonsensical offset and the
     scrubber renders it, so every reading is clamped into the recording and the
     resume point comes from this ref. */
  const currentMsRef = useRef(0);

  const setPosition = useCallback((ms: number) => {
    currentMsRef.current = ms;
    setCurrentMs(ms);
  }, []);

  /* The span the playhead is confined to, held in a ref rather than state: the
     frame loop reads it every tick, and rebuilding that effect each time a
     callout narrowed or freed the span would restart the loop under the
     reader. */
  const loopRef = useRef<readonly [number, number] | null>(null);

  /* The beat a lap rests on at each end before running again. Spans are authored
     around single interactions and are often well under a second, so without
     pauses to bracket them they read as a strobe rather than as one thing
     happening repeatedly. */
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
   * Run a lap again from `fromMs`, bracketed by a beat at each end: rest on the
   * frame it ran out on, settle onto the frame it starts from, then move. The
   * two rests are what make a lap read as one thing happening repeatedly instead
   * of a strobe, and landing on the first frame before moving means the eye has
   * somewhere to return to rather than being handed motion mid-stride.
   *
   * Serves a confined span and the whole recording alike — `repeat` is only the
   * span `[0, durationMs]` by another name.
   *
   * The replayer is paused through both beats but `playing` is left alone: the
   * transport is still looping, and flipping it each lap would flicker the
   * control and stop the frame loop that has to notice the lap run out at all.
   */
  const restartLoop = useCallback(
    (fromMs: number) => {
      if (holdRef.current !== null) {
        return;
      }

      const scheduledUnder = loopRef.current;

      /* The reader may have left the callout, scrubbed, paused, or turned repeat
         off during a beat — all of which mean this lap is no longer wanted. */
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

    setPosition(0);
    setDurationMs(replayer.getMetaData().totalTime);
    setReady(true);

    /* A recording is the whole point of the panel it lands in, and a still first
       frame reads as a broken image rather than as something waiting to be
       asked — so it runs on arrival. */
    replayer.play(0);
    setPlayingState(true);

    return () => {
      clearHold();
      replayer.destroy();
      replayerRef.current = null;
      setReady(false);
    };
  }, [clearHold, eventStream, setPlayingState, setPosition]);

  /* Rebound whenever the toggle flips, so the handler always closes over the
     current setting rather than reading it back through a ref. */
  useEffect(() => {
    const replayer = replayerRef.current;

    if (!ready || replayer === null) {
      return;
    }

    function handleFinish() {
      /* A span reaching the end of the recording runs out here rather than in
         the frame loop, so it has to be restarted from the same place — a
         confined playhead must not escape to the top on the whole recording's
         behalf. */
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

  /* rrweb exposes the playhead only by polling `getCurrentTime()` — there is no
     progress event to subscribe to — so the scrubber is driven off a frame loop
     that runs solely while the replay does. */
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
