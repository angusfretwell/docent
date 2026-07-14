import { contrastText } from "./color.js";
import { DEFAULT_PRESET, PRESET_PALETTES } from "./presets.js";

const swatches = document.getElementById("swatches");

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

render(PRESET_PALETTES[DEFAULT_PRESET]);
