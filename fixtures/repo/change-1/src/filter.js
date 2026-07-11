export function byBrightness(colors, min) {
  return colors.filter((color) => brightness(color) >= min);
}

function brightness([r, g, b]) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}
