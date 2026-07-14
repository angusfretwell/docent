export function toCss(colors) {
  const declarations = colors
    .map((color, index) => `  --swatch-${index + 1}: ${color};`)
    .join("\n");
  return `:root {\n${declarations}\n}`;
}

export function toJson(colors) {
  return JSON.stringify({ colors }, null, 2);
}

export function toText(colors, format) {
  return format === "json" ? toJson(colors) : toCss(colors);
}
