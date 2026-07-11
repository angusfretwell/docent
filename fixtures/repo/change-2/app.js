const MAX_SWATCHES = 8;
const HISTORY = [];

const swatches = document.getElementById("swatches");
const output = document.getElementById("output");

// Build a random rgb() string from three channels.
function randomChannel() {
  return Math.floor(Math.random() * 256);
}

function randomColor() {
  const channels = [randomChannel(), randomChannel(), randomChannel()];
  return `rgb(${channels.join(", ")})`;
}

function render(colors) {
  swatches.innerHTML = "";
  for (const color of colors) {
    const cell = document.createElement("div");
    cell.className = "swatch";
    cell.style.background = color;
    swatches.append(cell);
  }
}

function generate() {
  const colors = [];
  for (let i = 0; i < MAX_SWATCHES; i += 1) {
    colors.push(randomColor());
  }
  output.value = `${colors.length} swatches`;
  HISTORY.push(colors);
  render(colors);
}

document.getElementById("generate").addEventListener("click", generate);
generate();
