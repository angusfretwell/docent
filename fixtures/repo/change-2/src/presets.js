export const PRESET_PALETTES = {
  Tidepool: ["#04303b", "#d8f1ee", "#1f7a8c", "#bfa58a"],
  Ember: ["#2b0a0a", "#ffe3c9", "#c6462a", "#7a5c3e"],
  Orchard: ["#16281c", "#eaf3d8", "#4c8b3f", "#c9743a"],
  Nocturne: ["#0b0b18", "#e3e1f5", "#3f35a8", "#6e5a7a"],
  Sandbar: ["#3a2e23", "#f6ebdc", "#c99b56", "#7e8c7a"],
};

export const DEFAULT_PRESET = "Tidepool";

export function presetNames() {
  return Object.keys(PRESET_PALETTES);
}
