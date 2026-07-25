import { randomPalette } from "./color.js";
import { DEFAULT_PRESET, PRESET_PALETTES, presetNames } from "./presets.js";
import { render } from "./render.js";
import { getPalette, setPalette } from "./state.js";

const columns = document.getElementById("columns");
const randomButton = document.getElementById("random");
const presetSelect = document.getElementById("preset");

function show(next) {
  setPalette(next);
  render(columns, getPalette());
}

presetSelect.append(...presetNames().map((name) => new Option(name, name)));
presetSelect.value = DEFAULT_PRESET;

randomButton.addEventListener("click", () => show(randomPalette()));
presetSelect.addEventListener("change", () =>
  show(PRESET_PALETTES[presetSelect.value])
);

show(getPalette());
