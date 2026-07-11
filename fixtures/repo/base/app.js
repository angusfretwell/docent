const swatches = document.getElementById("swatches");

function render(colors) {
  swatches.innerHTML = "";
  for (const color of colors) {
    const cell = document.createElement("div");
    cell.className = "swatch";
    cell.style.background = color;
    swatches.append(cell);
  }
}

render(["#eeeeee", "#cccccc", "#aaaaaa"]);
