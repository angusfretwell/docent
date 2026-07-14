import { contrastText } from "./color.js";

const swatches = document.getElementById("swatches");
const historyList = document.getElementById("history");

export function createSwatch(color) {
  const cell = document.createElement("div");
  cell.className = "swatch";
  cell.style.background = color;
  cell.style.color = contrastText(color);
  cell.textContent = color;
  return cell;
}

export function render(colors) {
  swatches.innerHTML = "";
  for (const color of colors) {
    swatches.append(createSwatch(color));
  }
}

function createHistoryEntry(colors, index, onSelect) {
  const item = document.createElement("li");
  item.className = "history-entry";

  const strip = document.createElement("div");
  strip.className = "history-strip";
  for (const color of colors) {
    const band = document.createElement("span");
    band.style.background = color;
    strip.append(band);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Restore #${index + 1}`;
  button.addEventListener("click", () => onSelect(index));

  item.append(strip, button);
  return item;
}

export function renderHistory(entries, onSelect) {
  historyList.innerHTML = "";
  entries.forEach((colors, index) => {
    historyList.append(createHistoryEntry(colors, index, onSelect));
  });
}
