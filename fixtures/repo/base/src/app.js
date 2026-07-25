import { randomPalette } from "./color.js";
import { DEFAULT_PRESET, PRESET_PALETTES, presetNames } from "./presets.js";
import { render } from "./render.js";

const randomButton = document.getElementById("random");
const presetSelect = document.getElementById("preset");

let palette = PRESET_PALETTES[DEFAULT_PRESET];

function show(next) {
  palette = next;
  render(palette);
}

presetSelect.append(...presetNames().map((name) => new Option(name, name)));
presetSelect.value = DEFAULT_PRESET;

randomButton.addEventListener("click", () => show(randomPalette()));
presetSelect.addEventListener("change", () =>
  show(PRESET_PALETTES[presetSelect.value])
);

show(palette);
