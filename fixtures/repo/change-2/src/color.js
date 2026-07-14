const CHANNEL_MAX = 256;
const CONTRAST_PIVOT = 140;

export function clampChannel(value) {
  return Math.min(CHANNEL_MAX - 1, Math.max(0, Math.round(value)));
}

export function hexToChannels(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function channelsToHex(channels) {
  const digits = channels
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("");
  return `#${digits}`;
}

export function brightness(channels) {
  const [red, green, blue] = channels;
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

export function contrastText(hex) {
  return brightness(hexToChannels(hex)) > CONTRAST_PIVOT ? "#1b1b1b" : "#f5f5f5";
}

export function randomChannel(floor = 0, ceiling = CHANNEL_MAX) {
  const span = ceiling - floor;
  return clampChannel(floor + Math.random() * span);
}

export function randomColor({ floor = 0, ceiling = CHANNEL_MAX } = {}) {
  return channelsToHex([
    randomChannel(floor, ceiling),
    randomChannel(floor, ceiling),
    randomChannel(floor, ceiling),
  ]);
}

export function mix(left, right, weight = 0.5) {
  const from = hexToChannels(left);
  const to = hexToChannels(right);
  return channelsToHex(
    from.map((channel, index) => channel + (to[index] - channel) * weight)
  );
}
