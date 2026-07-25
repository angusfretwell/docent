/**
 * The rhythm every palette follows — a near-black, a near-white, a saturated
 * mid and a muted warm — so a rolled palette sits beside the presets instead of
 * looking like four unrelated colors.
 */
const RAMP = [
  { hue: 0, lightness: 0.12, saturation: 0.8 },
  { hue: 10, lightness: 0.9, saturation: 0.42 },
  { hue: -18, lightness: 0.45, saturation: 0.62 },
  { hue: 32, lightness: 0.55, saturation: 0.24 },
];

const HUE_JITTER = 12;

export function hexToChannels(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function channelsToHex(channels) {
  const digits = channels.map((channel) =>
    Math.round(channel).toString(16).padStart(2, "0")
  );
  return `#${digits.join("")}`;
}

export function brightness(channels) {
  const [red, green, blue] = channels;
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

export function contrastText(hex) {
  return brightness(hexToChannels(hex)) > 140 ? "#16191c" : "#ffffff";
}

function hslToHex(hue, saturation, lightness) {
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset) => {
    const angle = (offset + hue / 30) % 12;
    const shade = Math.max(-1, Math.min(angle - 3, 9 - angle, 1));
    return (lightness - amplitude * shade) * 255;
  };
  return channelsToHex([channel(0), channel(8), channel(4)]);
}

export function randomPalette() {
  const base = Math.random() * 360;
  return RAMP.map((step) =>
    hslToHex(
      base + step.hue + (Math.random() - 0.5) * HUE_JITTER,
      step.saturation,
      step.lightness
    )
  );
}
