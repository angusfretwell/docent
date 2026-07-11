const swatches = document.getElementById("swatches");
const output = document.getElementById("output");

// Build a random rgb() string from three channels.
function randomChannel() {
  return Math.floor(Math.random() * 256);
}

function randomColor() {
  const r = randomChannel();
  const g = randomChannel();
  const b = randomChannel();
  return `rgb(${r}, ${g}, ${b})`;
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
  for (let i = 0; i < 5; i += 1) {
    colors.push(randomColor());
  }
  render(colors);
}

document.getElementById("generate").addEventListener("click", generate);
generate();
