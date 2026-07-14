const CHANNEL_MAX = 256;

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
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${digits}`;
}

export function brightness(channels) {
  const [red, green, blue] = channels;
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

export function contrastText(hex) {
  return brightness(hexToChannels(hex)) > 140 ? "#1b1b1b" : "#f5f5f5";
}

export function randomChannel() {
  return Math.floor(Math.random() * CHANNEL_MAX);
}

export function randomColor() {
  return channelsToHex([randomChannel(), randomChannel(), randomChannel()]);
}
