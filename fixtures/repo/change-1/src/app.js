import { contrastText, randomColor } from "./color.js";
import { DEFAULT_PRESET, PRESET_PALETTES } from "./presets.js";

const SWATCH_COUNT = 5;

const swatches = document.getElementById("swatches");
const generateButton = document.getElementById("generate");

function createSwatch(color) {
  const cell = document.createElement("div");
  cell.className = "swatch";
  cell.style.background = color;
  cell.style.color = contrastText(color);
  cell.textContent = color;
  return cell;
}

function render(colors) {
  swatches.innerHTML = "";
  for (const color of colors) {
    swatches.append(createSwatch(color));
  }
}

function generate() {
  const colors = [];
  for (let index = 0; index < SWATCH_COUNT; index += 1) {
    colors.push(randomColor());
  }
  render(colors);
}

generateButton.addEventListener("click", generate);
render(PRESET_PALETTES[DEFAULT_PRESET]);
