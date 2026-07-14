import { randomColor } from "./color.js";
import { toText } from "./export.js";
import { createHistory } from "./history.js";
import { DEFAULT_PRESET, PRESET_PALETTES, presetNames } from "./presets.js";
import { render, renderHistory } from "./render.js";
import { loadLast, saveLast } from "./storage.js";

const DEFAULT_SWATCH_COUNT = 5;
const MAX_SWATCH_COUNT = 12;

const generateButton = document.getElementById("generate");
const resetButton = document.getElementById("reset");
const clearButton = document.getElementById("clear-history");
const countInput = document.getElementById("count");
const presetSelect = document.getElementById("preset");
const formatSelect = document.getElementById("format");
const exportOutput = document.getElementById("export");

const history = createHistory();

let current = [];

function fillPresets() {
  for (const name of presetNames()) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetSelect.append(option);
  }
  presetSelect.value = DEFAULT_PRESET;
}

function swatchCount() {
  const requested = Number.parseInt(countInput.value, 10);
  if (Number.isNaN(requested)) {
    return DEFAULT_SWATCH_COUNT;
  }
  return Math.min(MAX_SWATCH_COUNT, Math.max(1, requested));
}

function show(colors) {
  current = colors;
  render(colors);
  exportOutput.value = toText(colors, formatSelect.value);
  saveLast(colors);
}

function restore(index) {
  const colors = history.at(index);
  if (colors !== undefined) {
    show(colors);
  }
}

function generate() {
  const colors = [];
  for (let index = 0; index < swatchCount(); index += 1) {
    colors.push(randomColor());
  }
  history.push(colors);
  renderHistory(history.entries(), restore);
  show(colors);
}

function reset() {
  show(PRESET_PALETTES[presetSelect.value]);
}

function clearHistory() {
  history.clear();
  renderHistory(history.entries(), restore);
}

fillPresets();

generateButton.addEventListener("click", generate);
resetButton.addEventListener("click", reset);
clearButton.addEventListener("click", clearHistory);
presetSelect.addEventListener("change", reset);
formatSelect.addEventListener("change", () => show(current));
countInput.addEventListener("change", generate);

const restored = loadLast();
if (restored === undefined) {
  reset();
} else {
  show(restored);
}
