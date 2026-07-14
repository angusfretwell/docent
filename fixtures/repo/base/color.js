export function hexToChannels(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function brightness(channels) {
  const [red, green, blue] = channels;
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

export function contrastText(hex) {
  return brightness(hexToChannels(hex)) > 140 ? "#1b1b1b" : "#f5f5f5";
}
