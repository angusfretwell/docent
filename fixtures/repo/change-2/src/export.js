export function toCssVariables(palette) {
  const declarations = palette
    .map((hex, index) => `  --color-${index + 1}: ${hex};`)
    .join("\n");
  return {
    filename: "palette.css",
    mime: "text/css",
    text: `:root {\n${declarations}\n}\n`,
  };
}

export function toTailwindTheme(palette) {
  const declarations = palette
    .map((hex, index) => `  --color-palette-${index + 1}: ${hex};`)
    .join("\n");
  return {
    filename: "theme.css",
    mime: "text/css",
    text: `@import "tailwindcss";\n\n@theme {\n${declarations}\n}\n`,
  };
}

export function toFigmaTokens(palette) {
  const tokens = Object.fromEntries(
    palette.map((hex, index) => [
      String(index + 1),
      { $type: "color", $value: hex },
    ])
  );
  return {
    filename: "tokens.json",
    mime: "application/json",
    text: `${JSON.stringify({ palette: tokens }, null, 2)}\n`,
  };
}

const SERIALIZERS = {
  css: toCssVariables,
  figma: toFigmaTokens,
  tailwind: toTailwindTheme,
};

export function serialize(palette, format) {
  return SERIALIZERS[format](palette);
}
