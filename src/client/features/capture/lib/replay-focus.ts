import type { Replayer } from "rrweb";

/**
 * The reconstructed page is a real document with real controls, so without this
 * every button and field the capture happens to contain joins the tab order of
 * the review around it. `inert` takes the replay out of sequential focus and off
 * the accessibility tree, leaving the capture as the picture it is meant to be.
 */
export function sealReplay(replayer: Replayer) {
  replayer.iframe.inert = true;
}
