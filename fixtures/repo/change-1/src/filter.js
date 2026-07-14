import { brightness } from "./color.js";

const DEFAULT_MIN_BRIGHTNESS = 96;

export function byBrightness(colors, min = DEFAULT_MIN_BRIGHTNESS) {
  return colors.filter((color) => brightness(color) >= min);
}

export function darkest(colors) {
  return colors.reduce((best, color) =>
    brightness(color) < brightness(best) ? color : best
  );
}
