import { DEFAULT_PRESET, PRESET_PALETTES } from "./presets.js";

let palette = PRESET_PALETTES[DEFAULT_PRESET];

export function getPalette() {
  return palette;
}

export function setPalette(next) {
  palette = next;
}
