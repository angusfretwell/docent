import { randomPalette } from "./color.js";
import { serialize } from "./export.js";
import { DEFAULT_PRESET, PRESET_PALETTES, presetNames } from "./presets.js";
import { render } from "./render.js";
import { getFormat, getPalette, setFormat, setPalette } from "./state.js";

const COPIED_MS = 2000;

const columns = document.getElementById("columns");
const randomButton = document.getElementById("random");
const presetSelect = document.getElementById("preset");
const dialog = document.getElementById("export-dialog");
const openButton = document.getElementById("export-open");
const closeButton = document.getElementById("export-close");
const tabs = [...document.querySelectorAll(".tab")];
const code = document.getElementById("export-code");
const copyButton = document.getElementById("export-copy");
const downloadButton = document.getElementById("export-download");

let copiedTimer;

function show(next) {
  setPalette(next);
  render(columns, getPalette());
}

function renderExport() {
  const format = getFormat();
  const { filename, text } = serialize(getPalette(), format);

  code.textContent = text;
  downloadButton.textContent = `Download .${filename.split(".").at(-1)}`;

  for (const tab of tabs) {
    const selected = tab.dataset.format === format;
    tab.setAttribute("aria-selected", String(selected));
    if (selected) {
      code.setAttribute("aria-labelledby", tab.id);
    }
  }
}

async function copy() {
  const { text } = serialize(getPalette(), getFormat());
  await navigator.clipboard.writeText(text);

  copyButton.textContent = "Copied";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copyButton.textContent = "Copy";
  }, COPIED_MS);
}

function download() {
  const { filename, mime, text } = serialize(getPalette(), getFormat());
  const url = URL.createObjectURL(new Blob([text], { type: mime }));

  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();

  URL.revokeObjectURL(url);
}

presetSelect.append(...presetNames().map((name) => new Option(name, name)));
presetSelect.value = DEFAULT_PRESET;

randomButton.addEventListener("click", () => show(randomPalette()));
presetSelect.addEventListener("change", () =>
  show(PRESET_PALETTES[presetSelect.value])
);

openButton.addEventListener("click", () => {
  renderExport();
  dialog.showModal();
});
closeButton.addEventListener("click", () => dialog.close());
copyButton.addEventListener("click", copy);
downloadButton.addEventListener("click", download);

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    setFormat(tab.dataset.format);
    renderExport();
  });
}

dialog.addEventListener("close", () => {
  clearTimeout(copiedTimer);
  copyButton.textContent = "Copy";
});

show(getPalette());
