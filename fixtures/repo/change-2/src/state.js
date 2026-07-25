import { DEFAULT_PRESET, PRESET_PALETTES } from "./presets.js";

let palette = PRESET_PALETTES[DEFAULT_PRESET];
let format = "css";

export function getPalette() {
  return palette;
}

export function setPalette(next) {
  palette = next;
}

export function getFormat() {
  return format;
}

export function setFormat(next) {
  format = next;
}
