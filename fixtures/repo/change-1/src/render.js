import { contrastText } from "./color.js";

function createColumn(hex) {
  const column = document.createElement("li");
  column.className = "column";
  column.style.background = hex;
  column.style.color = contrastText(hex);

  const eyebrow = document.createElement("small");
  eyebrow.textContent = "Hex";

  const value = document.createElement("b");
  value.textContent = hex.toUpperCase();

  const label = document.createElement("div");
  label.className = "hex";
  label.append(eyebrow, value);

  column.append(label);
  return column;
}

export function render(target, palette) {
  target.replaceChildren(...palette.map(createColumn));
}
