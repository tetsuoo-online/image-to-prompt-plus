const DEFAULT_BACKGROUND = "Background and setting inferred from the uploaded image.";

const STYLE_PRESETS = {
  none: {
    kind: "none",
    fields: {},
  },
  photograph: {
    kind: "photo",
    fields: {
      aesthetics: "natural, realistic, balanced",
      lighting: "ambient lighting inferred from the source image",
      photo: "source-image composition, camera angle, and depth cues preserved",
      medium: "photograph",
    },
  },
  illustration: {
    kind: "art",
    fields: {
      aesthetics: "clean, illustrative, balanced",
      lighting: "even image lighting inferred from the source image",
      medium: "illustration",
      artStyle: "source-image illustration style preserved",
    },
  },
  render3d: {
    kind: "art",
    fields: {
      aesthetics: "dimensional, polished, balanced",
      lighting: "soft studio lighting inferred from the source image",
      medium: "3d_render",
      artStyle: "source-image 3D render style preserved",
    },
  },
  graphic_design: {
    kind: "art",
    fields: {
      aesthetics: "minimal, structured, professional",
      lighting: "even, diffuse design lighting",
      medium: "graphic_design",
      artStyle: "clean graphic design with source-image layout preserved",
    },
  },
  painting: {
    kind: "art",
    fields: {
      aesthetics: "painterly, composed, balanced",
      lighting: "source-image lighting preserved",
      medium: "painting",
      artStyle: "source-image painting style preserved",
    },
  },
  custom_photo: {
    kind: "photo",
    fields: {
      aesthetics: "",
      lighting: "",
      photo: "",
      medium: "photograph",
    },
  },
  custom_art: {
    kind: "art",
    fields: {
      aesthetics: "",
      lighting: "",
      medium: "illustration",
      artStyle: "",
    },
  },
};

const savedSettings = {
  caption_model: "florence2+sam3",
  style_model: "none",
  style_preset: "llm",
  dedup_iou_threshold: 0.70,
  sam3_confidence_threshold: 0.30,
  min_bbox_area: 40,
  max_elements: 40,
};

let settingsSaveTimer = null;

async function saveSettingsToServer() {
  const settings = {
    caption_model: state.captionModel,
    style_model: state.styleModel,
    style_preset: state.stylePreset,
    dedup_iou_threshold: parseFloat(els.dedupIouInput.value),
    sam3_confidence_threshold: parseFloat(els.sam3ConfInput.value),
    min_bbox_area: parseInt(els.minAreaInput.value, 10),
    max_elements: parseInt(els.maxElemsInput.value, 10),
  };
  Object.assign(savedSettings, settings);
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch {}
}

function scheduleSaveSettings() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(saveSettingsToServer, 600);
}

async function loadSettingsFromServer() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const s = await res.json();
    if (s.caption_model != null) savedSettings.caption_model = s.caption_model;
    if (s.style_model != null) savedSettings.style_model = s.style_model;
    if (s.style_preset != null) savedSettings.style_preset = s.style_preset;
    if (s.dedup_iou_threshold != null) savedSettings.dedup_iou_threshold = s.dedup_iou_threshold;
    if (s.sam3_confidence_threshold != null) savedSettings.sam3_confidence_threshold = s.sam3_confidence_threshold;
    if (s.min_bbox_area != null) savedSettings.min_bbox_area = s.min_bbox_area;
    if (s.max_elements != null) savedSettings.max_elements = s.max_elements;
    state.captionModel = savedSettings.caption_model;
    syncCaptionModelInput();
    state.styleModel = savedSettings.style_model;
    syncStyleModelInput();
    els.dedupIouInput.value = savedSettings.dedup_iou_threshold;
    els.dedupIouVal.textContent = Number(savedSettings.dedup_iou_threshold).toFixed(2);
    els.sam3ConfInput.value = savedSettings.sam3_confidence_threshold;
    els.sam3ConfVal.textContent = Number(savedSettings.sam3_confidence_threshold).toFixed(2);
    els.minAreaInput.value = savedSettings.min_bbox_area;
    els.minAreaVal.textContent = savedSettings.min_bbox_area;
    els.maxElemsInput.value = savedSettings.max_elements;
    els.maxElemsVal.textContent = savedSettings.max_elements;
  } catch {}
}

const state = {
  file: null,
  imageUrl: "",
  original: null,
  elements: [],
  selectedId: null,
  palette: [],
  caption: "",
  highLevelDescription: "",
  stylePreset: "llm",
  styleKind: "none",
  styleFields: {
    aesthetics: "",
    lighting: "",
    photo: "",
    medium: "",
    artStyle: "",
    palette: [],
  },
  background: "",
  captionModel: "florence2+sam3",
  styleModel: "none",
  drag: null,
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  folderInput: document.getElementById("folderInput"),
  pickFileBtn: document.getElementById("pickFileBtn"),
  pickFolderBtn: document.getElementById("pickFolderBtn"),
  addBoxBtn: document.getElementById("addBoxBtn"),
  leftResizer: document.getElementById("leftResizer"),
  itemsPanel: document.getElementById("itemsPanel"),
  stopBtn: document.getElementById("stopBtn"),
  autoDetectBtn: document.getElementById("autoDetectBtn"),
  resetBtn: document.getElementById("resetBtn"),
  emptyState: document.getElementById("emptyState"),
  loadingState: document.getElementById("loadingState"),
  imageWrap: document.getElementById("imageWrap"),
  previewImage: document.getElementById("previewImage"),
  overlay: document.getElementById("overlay"),
  itemsPanel: document.querySelector(".items-panel"),
  emptyItems: document.getElementById("emptyItems"),
  itemsList: document.getElementById("itemsList"),
  highLevelInput: document.getElementById("highLevelInput"),
  stylePresetInput: document.getElementById("stylePresetInput"),
  styleFields: document.getElementById("styleFields"),
  styleAestheticsInput: document.getElementById("styleAestheticsInput"),
  styleLightingInput: document.getElementById("styleLightingInput"),
  stylePhotoField: document.getElementById("stylePhotoField"),
  stylePhotoInput: document.getElementById("stylePhotoInput"),
  styleArtField: document.getElementById("styleArtField"),
  styleArtStyleInput: document.getElementById("styleArtStyleInput"),
  styleMediumInput: document.getElementById("styleMediumInput"),
  stylePaletteInput: document.getElementById("stylePaletteInput"),
  backgroundInput: document.getElementById("backgroundInput"),
  jsonPreview: document.getElementById("jsonPreview"),
  jsonStatus: document.getElementById("jsonStatus"),
  compactToggle: document.getElementById("compactToggle"),
  copyBtn: document.getElementById("copyBtn"),
  exportBtn: document.getElementById("exportBtn"),
  queueBar: document.getElementById("queueBar"),
  queueRail: document.getElementById("queueRail"),
  queueCounter: document.getElementById("queueCounter"),
  failedChip: document.getElementById("failedChip"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  captionModelInput: document.getElementById("captionModelInput"),
  sam3SettingsGroup: document.getElementById("sam3SettingsGroup"),
  stageFilename: document.getElementById("stageFilename"),
  loadingLabel: document.getElementById("loadingLabel"),
  textPromptInput: document.getElementById("textPromptInput"),
  generatePromptBtn: document.getElementById("generatePromptBtn"),
  generateError: document.getElementById("generateError"),
  addDialog: document.getElementById("addDialog"),
  addDialogClose: document.getElementById("addDialogClose"),
  addPromptInput: document.getElementById("addPromptInput"),
  addGenerateBtn: document.getElementById("addGenerateBtn"),
  addGenerateError: document.getElementById("addGenerateError"),
  addPickFileBtn: document.getElementById("addPickFileBtn"),
  addPickFolderBtn: document.getElementById("addPickFolderBtn"),
  folderBtn: document.getElementById("folderBtn"),
  dedupIouInput: document.getElementById("dedupIouInput"),
  dedupIouVal: document.getElementById("dedupIouVal"),
  sam3ConfInput: document.getElementById("sam3ConfInput"),
  sam3ConfVal: document.getElementById("sam3ConfVal"),
  minAreaInput: document.getElementById("minAreaInput"),
  minAreaVal: document.getElementById("minAreaVal"),
  maxElemsInput: document.getElementById("maxElemsInput"),
  maxElemsVal: document.getElementById("maxElemsVal"),
};

const queue = {
  docs: [],
  activeId: null,
  running: false,
  controller: null,
};

let restoring = false;

function uid() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function titleCase(text) {
  return String(text || "object")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHexColor(value) {
  const color = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : null;
}

function normalizePalette(value, maxColors = 16) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const palette = [];
  for (const entry of value) {
    const color = normalizeHexColor(entry);
    if (color && !seen.has(color)) {
      seen.add(color);
      palette.push(color);
    }
    if (palette.length >= maxColors) break;
  }
  return palette;
}

function parsePaletteText(text) {
  const matches = String(text || "").match(/#[0-9a-fA-F]{6}/g) || [];
  return normalizePalette(matches);
}

function paletteToText(palette) {
  return normalizePalette(palette).join(", ");
}

function resetStyleFields(target = state) {
  target.stylePreset = "llm";
  target.styleKind = "none";
  target.styleFields = {
    aesthetics: "",
    lighting: "",
    photo: "",
    medium: "",
    artStyle: "",
    palette: [],
  };
}

function applyStylePreset(name) {
  if (name === "llm") {
    state.stylePreset = "llm";
    const llmStyle = state.original?.json?.style_description;
    if (llmStyle) {
      syncStyleFromJson(llmStyle);
      state.stylePreset = "llm";
    } else {
      state.styleKind = "none";
      state.styleFields = { ...state.styleFields, palette: [] };
    }
    return;
  }
  const preset = STYLE_PRESETS[name] || STYLE_PRESETS.none;
  state.stylePreset = name in STYLE_PRESETS ? name : "llm";
  state.styleKind = preset.kind;
  if (preset.kind === "none") {
    state.styleFields = { ...state.styleFields, palette: [] };
    return;
  }
  const fields = preset.fields;
  state.styleFields = {
    aesthetics: fields.aesthetics ?? state.styleFields.aesthetics,
    lighting: fields.lighting ?? state.styleFields.lighting,
    photo: fields.photo ?? state.styleFields.photo,
    medium: fields.medium ?? state.styleFields.medium,
    artStyle: fields.artStyle ?? state.styleFields.artStyle,
    palette: state.styleFields.palette.length ? state.styleFields.palette : normalizePalette(state.palette),
  };
}

function syncStyleFromJson(style, target = state) {
  if (!isPlainObject(style)) {
    resetStyleFields(target);
    return;
  }
  const hasPhoto = Object.prototype.hasOwnProperty.call(style, "photo");
  const hasArtStyle = Object.prototype.hasOwnProperty.call(style, "art_style");
  if (hasPhoto === hasArtStyle) {
    resetStyleFields(target);
    return;
  }
  target.stylePreset = hasPhoto ? "custom_photo" : "custom_art";
  target.styleKind = hasPhoto ? "photo" : "art";
  target.styleFields = {
    aesthetics: cleanText(style.aesthetics),
    lighting: cleanText(style.lighting),
    photo: cleanText(style.photo),
    medium: cleanText(style.medium),
    artStyle: cleanText(style.art_style),
    palette: normalizePalette(style.color_palette),
  };
}

function buildStyleDescription(target = state) {
  if (target.styleKind === "none") return null;
  const fields = target.styleFields;
  if (target.styleKind === "photo") {
    const style = {
      aesthetics: fields.aesthetics,
      lighting: fields.lighting,
      photo: fields.photo,
      medium: fields.medium,
    };
    if (fields.palette.length) {
      style.color_palette = normalizePalette(fields.palette);
    }
    return style;
  }
  const style = {
    aesthetics: fields.aesthetics,
    lighting: fields.lighting,
    medium: fields.medium,
    art_style: fields.artStyle,
  };
  if (fields.palette.length) {
    style.color_palette = normalizePalette(fields.palette);
  }
  return style;
}

function elementToJson(item) {
  const itemType = item.type === "text" ? "text" : "obj";
  const bbox = parseBbox(item.bbox);
  const desc = item.description || item.label || "object";
  if (itemType === "text") {
    return {
      type: "text",
      bbox,
      text: item.text || item.label || "",
      desc,
    };
  }
  return {
    type: "obj",
    bbox,
    desc,
  };
}

function defaultJson(target = state) {
  const prompt = {
    high_level_description: target.highLevelDescription || target.caption || "Uploaded image scene.",
  };
  const style = buildStyleDescription(target);
  if (style) {
    prompt.style_description = style;
  }
  prompt.compositional_deconstruction = {
    background: target.background || DEFAULT_BACKGROUND,
    elements: target.elements.filter((item) => !item.hidden).map(elementToJson),
  };
  return prompt;
}

function setJsonStatus(message, isInvalid = false) {
  els.jsonStatus.textContent = message;
  els.jsonStatus.classList.toggle("invalid", isInvalid);
}

function formatOrder(keys) {
  return `(${keys.map((key) => `'${key}'`).join(", ")})`;
}

function checkUnknownKeys(obj, known, path, issues) {
  const unknown = Object.keys(obj).filter((key) => !known.includes(key));
  if (unknown.length) {
    issues.push(`${path}: unknown keys ${formatOrder(unknown)}`);
  }
}

function checkKeyOrder(obj, expected, path, issues) {
  const present = Object.keys(obj).filter((key) => expected.includes(key));
  if (present.join("|") !== expected.join("|")) {
    issues.push(`${path}: key order is ${formatOrder(present)}, expected ${formatOrder(expected)}`);
  }
  const extra = Object.keys(obj).filter((key) => !expected.includes(key));
  if (extra.length) {
    issues.push(`${path}: keys ${formatOrder(extra)} are not allowed here`);
  }
}

function validatePalette(palette, path, maxColors, issues) {
  if (!Array.isArray(palette)) {
    issues.push(`${path}: expected a list`);
    return;
  }
  if (palette.length > maxColors) {
    issues.push(`${path}: too many colors`);
    return;
  }
  palette.forEach((color, index) => {
    if (!normalizeHexColor(color) || normalizeHexColor(color) !== color) {
      issues.push(`${path}[${index}]: expected uppercase #RRGGBB`);
    }
  });
}

function validateBbox(bbox, path, issues) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    issues.push(`${path}: expected [ymin, xmin, ymax, xmax]`);
    return;
  }
  if (!bbox.every((value) => Number.isInteger(value))) {
    issues.push(`${path}: all values must be int`);
    return;
  }
  const [y1, x1, y2, x2] = bbox;
  if (!bbox.every((value) => value >= 0 && value <= 1000)) {
    issues.push(`${path}: values must be in [0, 1000]`);
  }
  if (y1 > y2) issues.push(`${path}: ymin greater than ymax`);
  if (x1 > x2) issues.push(`${path}: xmin greater than xmax`);
}

function validateIdeogramJson(data) {
  const issues = [];
  if (!isPlainObject(data)) {
    return ["root: expected a JSON object"];
  }
  checkUnknownKeys(data, ["high_level_description", "style_description", "compositional_deconstruction"], "root", issues);
  if ("high_level_description" in data && typeof data.high_level_description !== "string") {
    issues.push("high_level_description: expected a string");
  }
  if ("style_description" in data) {
    const style = data.style_description;
    if (!isPlainObject(style)) {
      issues.push("style_description: expected a dict");
    } else {
      checkUnknownKeys(style, ["aesthetics", "lighting", "photo", "art_style", "medium", "color_palette"], "style_description", issues);
      const hasPhoto = Object.prototype.hasOwnProperty.call(style, "photo");
      const hasArtStyle = Object.prototype.hasOwnProperty.call(style, "art_style");
      if (hasPhoto === hasArtStyle) {
        issues.push("style_description: expected exactly one of photo or art_style");
      } else {
        const expected = hasPhoto
          ? ["aesthetics", "lighting", "photo", "medium"]
          : ["aesthetics", "lighting", "medium", "art_style"];
        if ("color_palette" in style) expected.push("color_palette");
        checkKeyOrder(style, expected, "style_description", issues);
      }
      if ("color_palette" in style) {
        validatePalette(style.color_palette, "style_description.color_palette", 16, issues);
      }
    }
  }
  const composition = data.compositional_deconstruction;
  if (!isPlainObject(composition)) {
    issues.push("compositional_deconstruction: expected a dict");
    return issues;
  }
  checkKeyOrder(composition, ["background", "elements"], "compositional_deconstruction", issues);
  if (typeof composition.background !== "string") {
    issues.push("compositional_deconstruction.background: expected a string");
  }
  if (!Array.isArray(composition.elements)) {
    issues.push("compositional_deconstruction.elements: expected a list");
    return issues;
  }
  composition.elements.forEach((element, index) => {
    const path = `elements[${index}]`;
    if (!isPlainObject(element)) {
      issues.push(`${path}: expected a dict`);
      return;
    }
    checkUnknownKeys(element, ["type", "bbox", "text", "desc", "color_palette"], path, issues);
    if (!["obj", "text"].includes(element.type)) {
      issues.push(`${path}: type must be obj or text`);
      return;
    }
    const expected = ["type"];
    if ("bbox" in element) expected.push("bbox");
    if (element.type === "text") expected.push("text");
    expected.push("desc");
    if ("color_palette" in element) expected.push("color_palette");
    checkKeyOrder(element, expected, path, issues);
    if ("bbox" in element) validateBbox(element.bbox, `${path}.bbox`, issues);
    if (element.type === "text" && typeof element.text !== "string") {
      issues.push(`${path}.text: expected a string`);
    }
    if (typeof element.desc !== "string") {
      issues.push(`${path}.desc: expected a string`);
    }
    if ("color_palette" in element) {
      validatePalette(element.color_palette, `${path}.color_palette`, 5, issues);
    }
  });
  return issues;
}

function updateJsonStatusFor(data) {
  const issues = validateIdeogramJson(data);
  if (issues.length) {
    setJsonStatus(`${issues.length} schema issue${issues.length === 1 ? "" : "s"}`, true);
  } else {
    setJsonStatus("Valid Ideogram JSON");
  }
}

function markEdited() {
  if (restoring) return;
  const doc = getDoc(queue.activeId);
  if (doc && doc.status === "done" && !doc.edited) {
    doc.edited = true;
    renderQueue();
  }
}

function updateJson() {
  const data = defaultJson();
  els.jsonPreview.value = els.compactToggle.checked
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  updateJsonStatusFor(data);
  markEdited();
}

function syncControlValue(control, value) {
  if (document.activeElement !== control && control.value !== value) {
    control.value = value;
  }
}

function syncPromptInputs() {
  syncCaptionModelInput();
  syncControlValue(els.highLevelInput, state.highLevelDescription || state.caption || "");
  syncControlValue(els.backgroundInput, state.background || "");
  syncControlValue(els.stylePresetInput, state.stylePreset);
  els.styleFields.hidden = state.styleKind === "none";
  els.stylePhotoField.hidden = state.styleKind !== "photo";
  els.styleArtField.hidden = state.styleKind !== "art";
  syncControlValue(els.styleAestheticsInput, state.styleFields.aesthetics);
  syncControlValue(els.styleLightingInput, state.styleFields.lighting);
  syncControlValue(els.stylePhotoInput, state.styleFields.photo);
  syncControlValue(els.styleArtStyleInput, state.styleFields.artStyle);
  syncControlValue(els.styleMediumInput, state.styleFields.medium);
  syncControlValue(els.stylePaletteInput, paletteToText(state.styleFields.palette));
  syncStyleModelInput();
}

function syncCaptionModelInput() {
  if (els.captionModelInput && els.captionModelInput.value !== state.captionModel) {
    els.captionModelInput.value = state.captionModel;
  }
  if (els.sam3SettingsGroup) {
    els.sam3SettingsGroup.hidden = state.captionModel !== "florence2+sam3";
  }
}

function syncStyleModelInput() {
  const sel = document.getElementById("styleModelInput");
  if (sel && sel.value !== state.styleModel) sel.value = state.styleModel;
  const badge = document.getElementById("styleModelBadge");
  if (badge) {
    const label = state.styleModel !== "none" ? `Style: ${state.styleModel}` : "";
    badge.textContent = label;
    badge.hidden = !label;
  }
}

function setLoading(isLoading) {
  els.loadingState.hidden = !isLoading;
  if (isLoading) {
    els.emptyState.hidden = true;
  } else {
    els.emptyState.hidden = Boolean(state.imageUrl);
  }
}

function syncSelectedRows() {
  for (const row of els.itemsList.querySelectorAll(".item-row")) {
    row.classList.toggle("selected", row.dataset.id === state.selectedId);
  }
}

function revealItemRow(id, shouldFocus = false) {
  const row = els.itemsList.querySelector(`[data-id="${id}"]`);
  if (!row) return;
  const scrollContainer = els.itemsPanel || els.itemsList;
  const rowRect = row.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const target =
    scrollContainer.scrollTop +
    rowRect.top -
    containerRect.top -
    (scrollContainer.clientHeight - rowRect.height) / 2;
  const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  scrollContainer.scrollTop = clamp(target, 0, maxScroll);
  if (shouldFocus) {
    setTimeout(() => {
      const currentRow = els.itemsList.querySelector(`[data-id="${id}"]`);
      const input = currentRow?.querySelector(".label-input");
      input?.focus({ preventScroll: true });
      input?.select();
    }, 40);
  }
}

function selectItem(id, { scroll = false, focus = false } = {}) {
  if (state.selectedId === id) {
    if (scroll || focus) {
      requestAnimationFrame(() => revealItemRow(id, focus));
    }
    return;
  }
  state.selectedId = id;
  renderBoxes();
  syncSelectedRows();
  if (scroll || focus) {
    requestAnimationFrame(() => revealItemRow(id, focus));
  }
}

function readBoxStyle(bbox) {
  const [y1, x1, y2, x2] = bbox;
  return {
    top: `${y1 / 10}%`,
    left: `${x1 / 10}%`,
    width: `${(x2 - x1) / 10}%`,
    height: `${(y2 - y1) / 10}%`,
  };
}

function renderBoxes() {
  els.overlay.innerHTML = "";
  for (const item of state.elements) {
    const box = document.createElement("div");
    box.className = `box${item.id === state.selectedId ? " selected" : ""}${item.hidden ? " hidden" : ""}`;
    box.dataset.id = item.id;
    Object.assign(box.style, readBoxStyle(item.bbox));
    box.innerHTML = `<span class="box-label">${titleCase(item.label)}</span>`;
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = document.createElement("span");
      handle.className = `handle ${corner}`;
      handle.dataset.handle = corner;
      box.appendChild(handle);
    }
    box.addEventListener("pointerdown", startDrag);
    box.addEventListener("mousedown", startDrag);
    box.addEventListener("click", () => selectItem(item.id, { scroll: true, focus: true }));
    els.overlay.appendChild(box);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeItemRow(item) {
  const row = document.createElement("div");
  row.className = `item-row${item.id === state.selectedId ? " selected" : ""}`;
  row.dataset.id = item.id;
  row.innerHTML = `
    <span class="swatch" style="background:${item.color || "#d0d0d0"}"></span>
    <div class="item-fields">
      <input class="label-input" value="${escapeHtml(item.label || "")}" aria-label="Item label" />
      <div class="item-meta">
        <select class="type-input" aria-label="Item type">
          <option value="obj"${item.type === "obj" ? " selected" : ""}>obj</option>
          <option value="text"${item.type === "text" ? " selected" : ""}>text</option>
        </select>
      </div>
      <label class="text-value-wrap"${item.type === "text" ? "" : " hidden"}>
        <span>Literal text</span>
        <input class="text-value-input" value="${escapeHtml(item.text || item.label || "")}" aria-label="Literal text" />
      </label>
      <textarea class="desc-input" aria-label="Item description">${escapeHtml(item.description || "")}</textarea>
    </div>
    <div class="item-actions">
      <button class="mini hide-btn" type="button" title="Hide">${item.hidden ? "Show" : "Hide"}</button>
      <button class="mini dup-btn" type="button" title="Duplicate">Dup</button>
      <button class="mini del-btn" type="button" title="Delete">Del</button>
    </div>
  `;
  row.addEventListener("click", (event) => {
    if (event.target.closest("input, textarea, select, button")) {
      return;
    }
    selectItem(item.id);
  });
  for (const control of row.querySelectorAll("input, textarea, select")) {
    control.addEventListener("pointerdown", (event) => event.stopPropagation());
    control.addEventListener("mousedown", (event) => event.stopPropagation());
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("focus", () => selectItem(item.id));
  }
  const labelInput = row.querySelector(".label-input");
  const typeInput = row.querySelector(".type-input");
  const textWrap = row.querySelector(".text-value-wrap");
  const textInput = row.querySelector(".text-value-input");
  const descInput = row.querySelector(".desc-input");

  labelInput.addEventListener("input", (event) => {
    const value = event.target.value;
    item.label = value;
    if (item.type === "text") {
      item.text = value;
      textInput.value = event.target.value;
      item.description = `text "${value}"`;
    } else {
      item.description = value;
    }
    descInput.value = item.description;
    item._lastLabel = value;
    updateJson();
    renderBoxes();
  });
  typeInput.addEventListener("change", (event) => {
    item.type = event.target.value === "text" ? "text" : "obj";
    if (item.type === "text") {
      item.text = item.text || item.label || item.description || "text";
      if (!item.description || item.description === item._lastLabel) {
        item.description = item.text;
        descInput.value = item.description;
      }
      textInput.value = item.text;
      textWrap.hidden = false;
    } else {
      textWrap.hidden = true;
    }
    updateJson();
  });
  textInput.addEventListener("input", (event) => {
    item.text = event.target.value;
    if (!item.label || item.label === item._lastLabel) {
      item.label = event.target.value;
      labelInput.value = event.target.value;
      item._lastLabel = event.target.value;
      renderBoxes();
    }
    updateJson();
  });
  descInput.addEventListener("input", (event) => {
    item.description = event.target.value;
    updateJson();
  });
  row.querySelector(".hide-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    item.hidden = !item.hidden;
    render();
  });
  row.querySelector(".dup-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = uid();
    copy.label = `${item.label || "object"} copy`;
    copy.bbox = offsetBox(copy.bbox, 20);
    state.elements.push(copy);
    state.selectedId = copy.id;
    render();
    requestAnimationFrame(() => revealItemRow(copy.id, true));
  });
  row.querySelector(".del-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    state.elements = state.elements.filter((entry) => entry.id !== item.id);
    state.selectedId = state.elements[0]?.id || null;
    render();
  });
  return row;
}

function renderItems() {
  els.itemsList.innerHTML = "";
  els.emptyItems.hidden = state.elements.length > 0;
  for (const item of state.elements) {
    els.itemsList.appendChild(makeItemRow(item));
  }
}

function render() {
  renderBoxes();
  renderItems();
  syncPromptInputs();
  updateJson();
}

function offsetBox(bbox, amount) {
  const [y1, x1, y2, x2] = bbox;
  return [
    clamp(y1 + amount, 0, 990),
    clamp(x1 + amount, 0, 990),
    clamp(y2 + amount, 10, 1000),
    clamp(x2 + amount, 10, 1000),
  ];
}

function mapResultElement(item, index) {
  const type = item.type === "text" ? "text" : "obj";
  const label = item.label || item.text || `object ${index + 1}`;
  return {
    id: item.id || uid(),
    type,
    label,
    text: type === "text" ? item.text || label : item.text || "",
    description: item.description || item.text || item.label || `object ${index + 1}`,
    bbox: parseBbox(item.bbox || [250, 250, 750, 750]),
    color: item.color || "#D0D0D0",
    hidden: false,
    _lastLabel: label,
  };
}

function getDoc(id) {
  return queue.docs.find((doc) => doc.id === id) || null;
}

function activeDoc() {
  return getDoc(queue.activeId);
}

function createDoc(file) {
  return {
    id: uid(),
    file,
    name: file.name || "image",
    imageUrl: URL.createObjectURL(file),
    status: "queued",
    error: "",
    edited: false,
    original: null,
    elements: [],
    selectedId: null,
    palette: [],
    caption: "",
    highLevelDescription: "",
    stylePreset: savedSettings.style_preset || "llm",
    styleKind: "none",
    styleFields: { aesthetics: "", lighting: "", photo: "", medium: "", artStyle: "", palette: [] },
    background: "",
    captionModel: savedSettings.caption_model || "florence2+sam3",
    styleModel: savedSettings.style_model || "none",
  };
}

const DOC_FIELDS = [
  "elements",
  "selectedId",
  "palette",
  "caption",
  "highLevelDescription",
  "stylePreset",
  "styleKind",
  "styleFields",
  "background",
  "captionModel",
  "styleModel",
];

function saveActiveDoc() {
  const doc = activeDoc();
  if (!doc) return;
  for (const field of DOC_FIELDS) {
    doc[field] = state[field];
  }
  doc.original = state.original;
}

function loadDoc(doc) {
  restoring = true;
  queue.activeId = doc ? doc.id : null;
  if (document.activeElement && document.activeElement.matches?.("input, textarea, select")) {
    document.activeElement.blur();
  }
  if (doc) {
    state.file = doc.file;
    state.imageUrl = doc.imageUrl;
    state.original = doc.original;
    for (const field of DOC_FIELDS) {
      state[field] = doc[field];
    }
    state.captionModel = doc.captionModel ?? "florence2+sam3";
    syncCaptionModelInput();
    state.styleModel = doc.styleModel ?? "none";
    syncStyleModelInput();
    els.previewImage.src = doc.imageUrl;
  } else {
    state.file = null;
    state.imageUrl = "";
    state.original = null;
    state.elements = [];
    state.selectedId = null;
    state.palette = [];
    state.caption = "";
    state.highLevelDescription = "";
    state.background = "";
    resetStyleFields();
    els.previewImage.removeAttribute("src");
  }
  els.imageWrap.hidden = !doc;
  render();
  restoring = false;
  renderQueue();
}

function activateDoc(id) {
  if (queue.activeId === id) return;
  saveActiveDoc();
  loadDoc(getDoc(id));
  requestAnimationFrame(() => {
    const tile = els.queueRail.querySelector(`[data-id="${id}"]`);
    tile?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  });
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file && file.type.startsWith("image/"));
  if (!files.length) return;
  const docs = files.map(createDoc);
  queue.docs.push(...docs);
  if (!activeDoc()) {
    loadDoc(docs[0]);
  } else {
    renderQueue();
  }
  requestAnimationFrame(() => {
    els.queueRail.scrollLeft = els.queueRail.scrollWidth;
  });
  pumpQueue();
}

async function requestAnalysis(file, signal) {
  const form = new FormData();
  form.append("file", file);
  form.append("caption_model", state.captionModel || "florence2+sam3");
  form.append("style_model", state.styleModel || "none");
  const response = await fetch("/api/analyze", { method: "POST", body: form, signal });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { detail = text; }
    throw new Error(detail || "Analysis failed.");
  }
  return response.json();
}

function mapGeneratedElement(elem, index) {
  const type = elem.type === "text" ? "text" : "obj";
  const words = (elem.desc || "").split(/\s+/).slice(0, 5).join(" ");
  const label = words || `object ${index + 1}`;
  return {
    id: uid(),
    type,
    label,
    text: type === "text" ? elem.text || "" : "",
    description: elem.desc || label,
    bbox: parseBbox(elem.bbox || [300, 300, 700, 700]),
    color: "#D0D0D0",
    hidden: false,
    _lastLabel: label,
  };
}

function populateDocFromJson(doc, jsonData) {
  doc.highLevelDescription = jsonData.high_level_description || "";
  doc.caption = doc.highLevelDescription;
  syncStyleFromJson(jsonData.style_description, doc);
  if (doc.styleKind !== "none") doc.stylePreset = "llm";
  const comp = jsonData.compositional_deconstruction || {};
  doc.background = comp.background || "";
  doc.elements = (comp.elements || []).map(mapGeneratedElement);
  doc.selectedId = doc.elements[0]?.id || null;
  doc.palette = [];
  doc.original = { json: jsonData };
}

async function createBlankCanvasDoc() {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8f8f7";
  ctx.fillRect(0, 0, 1000, 1000);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const file = new File([blob], "generated.png", { type: "image/png" });
      resolve(createDoc(file));
    }, "image/png");
  });
}

async function generateAndAddToQueue(prompt, styleModel, errorEl, btn) {
  errorEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const result = await requestGenerate(prompt, styleModel, null);
    const doc = await createBlankCanvasDoc();
    populateDocFromJson(doc, result.json);
    doc.status = "done";
    queue.docs.push(doc);
    loadDoc(doc);
    renderQueue();
    return true;
  } catch (err) {
    errorEl.textContent = err.message || "Generation failed.";
    errorEl.hidden = false;
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate JSON";
  }
}

async function requestGenerate(prompt, styleModel, signal) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, style_model: styleModel }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { detail = text; }
    throw new Error(detail || "Generation failed.");
  }
  return response.json();
}

function applyAnalysis(doc, result) {
  doc.original = result;
  doc.elements = (result.elements || []).map(mapResultElement);
  doc.selectedId = doc.elements[0]?.id || null;
  doc.caption = result.caption || "";
  doc.highLevelDescription = result.json?.high_level_description || result.caption || "";
  syncStyleFromJson(result.json?.style_description, doc);
  if (doc.styleKind !== "none") doc.stylePreset = "llm";
  doc.background = result.json?.compositional_deconstruction?.background || result.background || "";
  doc.palette = normalizePalette(result.palette || []);
  doc.styleModelUsed = result.style_model ?? "none";
  doc.edited = false;
}

async function pumpQueue() {
  if (queue.running) return;
  const doc = queue.docs.find((entry) => entry.status === "queued");
  if (!doc) return;
  queue.running = true;
  queue.controller = new AbortController();
  doc.status = "analyzing";
  renderQueue();
  try {
    const result = await requestAnalysis(doc.file, queue.controller.signal);
    applyAnalysis(doc, result);
    doc.status = "done";
  } catch (error) {
    doc.status = "failed";
    doc.error = error.name === "AbortError" ? "Cancelled" : (error.message || "Analysis failed.");
  }
  queue.running = false;
  queue.controller = null;
  if (getDoc(doc.id) && doc.id === queue.activeId && doc.status === "done") {
    loadDoc(doc);
  } else {
    renderQueue();
  }
  pumpQueue();
}

function removeDoc(id) {
  const doc = getDoc(id);
  if (!doc || doc.status === "analyzing") return;
  const index = queue.docs.indexOf(doc);
  queue.docs.splice(index, 1);
  URL.revokeObjectURL(doc.imageUrl);
  if (queue.activeId === id) {
    queue.activeId = null;
    loadDoc(queue.docs[index] || queue.docs[index - 1] || null);
  } else {
    renderQueue();
  }
}

function retryDoc(id) {
  const doc = getDoc(id);
  if (!doc || doc.status !== "failed") return;
  doc.status = "queued";
  doc.error = "";
  renderQueue();
  pumpQueue();
}

function reanalyzeActive() {
  const doc = activeDoc();
  if (!doc || doc.status === "queued" || doc.status === "analyzing") return;
  doc.status = "queued";
  doc.error = "";
  renderQueue();
  pumpQueue();
}

function syncStageLoading() {
  const doc = activeDoc();
  const pending = Boolean(doc) && (doc.status === "queued" || doc.status === "analyzing");
  setLoading(pending);
  els.stopBtn.hidden = !queue.running;
  if (pending) {
    els.loadingLabel.textContent = doc.status === "queued" ? "Waiting in queue" : "Analyzing image";
  }
  const filename = doc ? (doc.name || "") : "";
  els.stageFilename.textContent = filename;
  els.stageFilename.hidden = !filename;
}

function makeQueueTile(doc) {
  const tile = document.createElement("div");
  tile.className = `queue-tile ${doc.status}${doc.id === queue.activeId ? " active" : ""}`;
  tile.dataset.id = doc.id;

  const main = document.createElement("button");
  main.type = "button";
  main.className = "tile-main";
  main.title = doc.status === "failed" && doc.error ? `${doc.name} — ${doc.error}` : doc.name;
  main.setAttribute("aria-label", `${doc.name} (${doc.status})`);
  const img = document.createElement("img");
  img.src = doc.imageUrl;
  img.alt = "";
  main.appendChild(img);
  if (doc.status === "analyzing") {
    const badge = document.createElement("span");
    badge.className = "tile-badge";
    badge.innerHTML = '<span class="spinner"></span>';
    main.appendChild(badge);
  } else if (doc.status === "done") {
    const badge = document.createElement("span");
    badge.className = "tile-badge done-badge";
    badge.textContent = "✓";
    main.appendChild(badge);
  }
  if (doc.edited) {
    const dot = document.createElement("span");
    dot.className = "tile-dot";
    dot.title = "Edited";
    main.appendChild(dot);
  }
  main.addEventListener("click", () => activateDoc(doc.id));
  tile.appendChild(main);

  if (doc.status === "failed") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "tile-badge retry-badge";
    retry.textContent = "↻";
    retry.title = doc.error ? `Retry — ${doc.error}` : "Retry";
    retry.addEventListener("click", (event) => {
      event.stopPropagation();
      retryDoc(doc.id);
    });
    tile.appendChild(retry);
  }

  if (doc.status !== "analyzing") {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tile-remove";
    remove.textContent = "×";
    remove.title = "Remove";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeDoc(doc.id);
    });
    tile.appendChild(remove);
  }

  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = doc.status === "failed" ? "failed" : doc.name;
  tile.appendChild(name);
  return tile;
}

function renderQueue() {
  els.queueBar.hidden = queue.docs.length === 0;
  const scrollLeft = els.queueRail.scrollLeft;
  els.queueRail.innerHTML = "";
  for (const doc of queue.docs) {
    els.queueRail.appendChild(makeQueueTile(doc));
  }
  const addTile = document.createElement("button");
  addTile.type = "button";
  addTile.className = "queue-add";
  addTile.title = "Add images";
  addTile.textContent = "+";
  addTile.addEventListener("click", () => els.addDialog.showModal());
  els.queueRail.appendChild(addTile);
  els.queueRail.scrollLeft = scrollLeft;
  const done = queue.docs.filter((doc) => doc.status === "done").length;
  const failed = queue.docs.filter((doc) => doc.status === "failed").length;
  els.queueCounter.textContent = `${done} of ${queue.docs.length} analyzed`;
  els.failedChip.hidden = failed === 0;
  els.failedChip.textContent = `${failed} failed`;
  els.exportAllBtn.disabled = done === 0;
  syncStageLoading();
}

function addBox() {
  const item = {
    id: uid(),
    type: "obj",
    label: "object",
    text: "",
    description: "object",
    bbox: [300, 300, 700, 700],
    color: "#BDBAB2",
    hidden: false,
    _lastLabel: "object",
  };
  state.elements.push(item);
  state.selectedId = item.id;
  render();
}

function resetToOriginal() {
  if (!state.original) {
    state.elements = [];
    state.selectedId = null;
    resetStyleFields();
    render();
    return;
  }
  state.elements = (state.original.elements || []).map(mapResultElement);
  state.selectedId = state.elements[0]?.id || null;
  state.caption = state.original.caption || "";
  state.highLevelDescription = state.original.json?.high_level_description || state.original.caption || "";
  syncStyleFromJson(state.original.json?.style_description);
  if (state.styleKind !== "none") state.stylePreset = "llm";
  state.background = state.original.json?.compositional_deconstruction?.background || state.original.background || "";
  state.palette = normalizePalette(state.original.palette || []);
  render();
}

function normalizedPointer(event) {
  const rect = els.overlay.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 1000, 0, 1000),
    y: clamp(((event.clientY - rect.top) / rect.height) * 1000, 0, 1000),
  };
}

function startDrag(event) {
  const box = event.currentTarget;
  const id = box.dataset.id;
  const item = state.elements.find((entry) => entry.id === id);
  if (!item) return;
  selectItem(id, { scroll: true, focus: true });
  event.preventDefault();
  if (typeof event.pointerId === "number" && box.setPointerCapture) {
    box.setPointerCapture(event.pointerId);
  }
  state.drag = {
    id,
    handle: event.target.dataset.handle || "move",
    start: normalizedPointer(event),
    bbox: [...item.bbox],
  };
}

function updateDrag(event) {
  if (!state.drag) return;
  const item = state.elements.find((entry) => entry.id === state.drag.id);
  if (!item) return;
  const point = normalizedPointer(event);
  const dx = point.x - state.drag.start.x;
  const dy = point.y - state.drag.start.y;
  let [y1, x1, y2, x2] = state.drag.bbox;
  const handle = state.drag.handle;
  if (handle === "move") {
    const width = x2 - x1;
    const height = y2 - y1;
    x1 = clamp(x1 + dx, 0, 1000 - width);
    y1 = clamp(y1 + dy, 0, 1000 - height);
    x2 = x1 + width;
    y2 = y1 + height;
  } else {
    if (handle.includes("n")) y1 = clamp(y1 + dy, 0, y2 - 10);
    if (handle.includes("s")) y2 = clamp(y2 + dy, y1 + 10, 1000);
    if (handle.includes("w")) x1 = clamp(x1 + dx, 0, x2 - 10);
    if (handle.includes("e")) x2 = clamp(x2 + dx, x1 + 10, 1000);
  }
  item.bbox = [Math.round(y1), Math.round(x1), Math.round(y2), Math.round(x2)];
  renderBoxes();
  updateJson();
}

function stopDrag() {
  state.drag = null;
}

async function copyJson() {
  const text = els.jsonPreview.value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Clipboard access was blocked.");
    }
  }
  els.copyBtn.textContent = "Copied";
  setTimeout(() => {
    els.copyBtn.textContent = "Copy";
  }, 900);
}

function jsonFileName(name) {
  const base = String(name || "").replace(/\.[^.]+$/, "").trim();
  return `${base || "ideogram-prompt"}.json`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const blob = new Blob([els.jsonPreview.value], { type: "application/json" });
  downloadBlob(blob, jsonFileName(activeDoc()?.name));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    central.push({ name, crc, size: data.length, offset });
    offset += 30 + name.length + data.length;
  }
  const cdStart = offset;
  for (const entry of central) {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, dosTime, true);
    header.setUint16(14, dosDate, true);
    header.setUint32(16, entry.crc, true);
    header.setUint32(20, entry.size, true);
    header.setUint32(24, entry.size, true);
    header.setUint16(28, entry.name.length, true);
    header.setUint32(42, entry.offset, true);
    chunks.push(new Uint8Array(header.buffer), entry.name);
    offset += 46 + entry.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, offset - cdStart, true);
  end.setUint32(16, cdStart, true);
  chunks.push(new Uint8Array(end.buffer));
  return new Blob(chunks, { type: "application/zip" });
}

function exportAll() {
  saveActiveDoc();
  const docs = queue.docs.filter((doc) => doc.status === "done");
  if (!docs.length) return;
  if (docs.length === 1) {
    const blob = new Blob([JSON.stringify(defaultJson(docs[0]), null, 2)], { type: "application/json" });
    downloadBlob(blob, jsonFileName(docs[0].name));
    return;
  }
  const used = new Set();
  const entries = docs.map((doc) => {
    let name = jsonFileName(doc.name);
    let counter = 2;
    while (used.has(name)) {
      name = jsonFileName(doc.name).replace(/\.json$/, `-${counter}.json`);
      counter += 1;
    }
    used.add(name);
    return { name, text: JSON.stringify(defaultJson(doc), null, 2) };
  });
  downloadBlob(buildZip(entries), "image-prompts.zip");
}

function parseBbox(value, fallback = [300, 300, 700, 700]) {
  if (!Array.isArray(value) || value.length < 4) {
    return fallback;
  }
  const numbers = value.slice(0, 4).map((entry) => Number(entry));
  if (numbers.some((entry) => !Number.isFinite(entry))) {
    return fallback;
  }
  let [y1, x1, y2, x2] = numbers.map((entry) => Math.round(clamp(entry, 0, 1000)));
  if (y2 < y1) [y1, y2] = [y2, y1];
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 - y1 < 10) y2 = clamp(y1 + 10, 10, 1000);
  if (x2 - x1 < 10) x2 = clamp(x1 + 10, 10, 1000);
  return [y1, x1, y2, x2];
}

function syncFromJsonObject(data) {
  const previous = state.elements;
  const composition = data?.compositional_deconstruction || {};
  const jsonElements = Array.isArray(composition.elements) ? composition.elements : [];
  state.highLevelDescription = cleanText(data.high_level_description, state.highLevelDescription || state.caption);
  state.caption = state.highLevelDescription;
  syncStyleFromJson(data.style_description);
  state.background = cleanText(composition.background, state.background || DEFAULT_BACKGROUND);
  const stylePalette = normalizePalette(data.style_description?.color_palette || []);
  if (stylePalette.length) {
    state.palette = stylePalette;
  }
  state.elements = jsonElements.map((entry, index) => {
    const existing = previous[index] || {};
    const type = entry.type === "text" ? "text" : "obj";
    const desc = cleanText(entry.desc, existing.description || existing.label || `object ${index + 1}`);
    const text = type === "text" ? cleanText(entry.text, existing.text || existing.label || desc) : cleanText(entry.text, existing.text || "");
    const label = type === "text" ? text || desc : desc || `object ${index + 1}`;
    return {
      id: existing.id || uid(),
      type,
      label,
      text,
      description: desc || label,
      bbox: parseBbox(entry.bbox, existing.bbox || [300, 300, 700, 700]),
      color: existing.color || "#BDBAB2",
      hidden: false,
      _lastLabel: label,
    };
  });
  if (!state.elements.some((entry) => entry.id === state.selectedId)) {
    state.selectedId = state.elements[0]?.id || null;
  }
}

function applyJsonDraft() {
  try {
    const data = JSON.parse(els.jsonPreview.value);
    syncFromJsonObject(data);
    renderBoxes();
    renderItems();
    syncPromptInputs();
    updateJsonStatusFor(data);
  } catch (error) {
    setJsonStatus(error instanceof SyntaxError ? "Invalid JSON" : "Unsupported JSON", true);
  }
}

function updatePromptField(field) {
  if (field === "highLevel") {
    state.highLevelDescription = els.highLevelInput.value;
    state.caption = state.highLevelDescription;
  } else if (field === "background") {
    state.background = els.backgroundInput.value;
  }
  updateJson();
}

function updateStyleField(field) {
  if (field === "aesthetics") state.styleFields.aesthetics = els.styleAestheticsInput.value;
  if (field === "lighting") state.styleFields.lighting = els.styleLightingInput.value;
  if (field === "photo") state.styleFields.photo = els.stylePhotoInput.value;
  if (field === "artStyle") state.styleFields.artStyle = els.styleArtStyleInput.value;
  if (field === "medium") state.styleFields.medium = els.styleMediumInput.value;
  if (field === "palette") state.styleFields.palette = parsePaletteText(els.stylePaletteInput.value);
  updateJson();
}

els.pickFileBtn.addEventListener("click", () => els.fileInput.click());
els.pickFolderBtn.addEventListener("click", () => els.folderInput.click());
els.folderBtn.addEventListener("click", () => els.folderInput.click());
els.fileInput.addEventListener("change", () => {
  handleFiles(els.fileInput.files);
  els.fileInput.value = "";
});
els.folderInput.addEventListener("change", () => {
  handleFiles(els.folderInput.files);
  els.folderInput.value = "";
});
els.addBoxBtn.addEventListener("click", addBox);
els.stopBtn.addEventListener("click", () => { if (queue.controller) queue.controller.abort(); });

(function () {
  let startX = 0, startW = 0;
  els.leftResizer.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startW = els.itemsPanel.getBoundingClientRect().width;
    els.leftResizer.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!els.leftResizer.classList.contains("resizing")) return;
    const w = Math.max(180, Math.min(520, startW + e.clientX - startX));
    document.documentElement.style.setProperty("--left-w", w + "px");
  });
  document.addEventListener("mouseup", () => {
    if (!els.leftResizer.classList.contains("resizing")) return;
    els.leftResizer.classList.remove("resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}());
els.autoDetectBtn.addEventListener("click", reanalyzeActive);
els.resetBtn.addEventListener("click", resetToOriginal);
els.exportAllBtn.addEventListener("click", exportAll);
els.failedChip.addEventListener("click", () => {
  const failed = queue.docs.find((doc) => doc.status === "failed");
  if (!failed) return;
  const tile = els.queueRail.querySelector(`[data-id="${failed.id}"]`);
  tile?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
});
els.queueRail.addEventListener(
  "wheel",
  (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      els.queueRail.scrollLeft += event.deltaY;
    }
  },
  { passive: false }
);
window.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.target.closest?.("input, textarea, select")) return;
  if (!queue.activeId || queue.docs.length < 2) return;
  const index = queue.docs.findIndex((doc) => doc.id === queue.activeId);
  const next = queue.docs[event.key === "ArrowLeft" ? index - 1 : index + 1];
  if (next) {
    event.preventDefault();
    activateDoc(next.id);
  }
});
window.addEventListener("paste", (event) => {
  if (event.clipboardData?.files?.length) {
    handleFiles(event.clipboardData.files);
  }
});
els.compactToggle.addEventListener("change", updateJson);
els.copyBtn.addEventListener("click", () => copyJson().catch(() => window.alert("Clipboard access was blocked.")));
els.exportBtn.addEventListener("click", exportJson);
els.highLevelInput.addEventListener("input", () => updatePromptField("highLevel"));
els.backgroundInput.addEventListener("input", () => updatePromptField("background"));
els.stylePresetInput.addEventListener("change", () => {
  applyStylePreset(els.stylePresetInput.value);
  syncPromptInputs();
  updateJson();
  saveSettingsToServer();
});
els.styleAestheticsInput.addEventListener("input", () => updateStyleField("aesthetics"));
els.styleLightingInput.addEventListener("input", () => updateStyleField("lighting"));
els.stylePhotoInput.addEventListener("input", () => updateStyleField("photo"));
els.styleArtStyleInput.addEventListener("input", () => updateStyleField("artStyle"));
els.styleMediumInput.addEventListener("input", () => updateStyleField("medium"));
els.stylePaletteInput.addEventListener("input", () => updateStyleField("palette"));
els.captionModelInput?.addEventListener("change", (e) => {
  state.captionModel = e.target.value;
  syncCaptionModelInput();
  const doc = activeDoc();
  if (doc) doc.captionModel = state.captionModel;
  saveSettingsToServer();
});
document.getElementById("styleModelInput")?.addEventListener("change", (e) => {
  state.styleModel = e.target.value;
  syncStyleModelInput();
  const doc = activeDoc();
  if (doc) doc.styleModel = state.styleModel;
  saveSettingsToServer();
});
els.dedupIouInput.addEventListener("input", () => {
  els.dedupIouVal.textContent = Number(els.dedupIouInput.value).toFixed(2);
  scheduleSaveSettings();
});
els.sam3ConfInput.addEventListener("input", () => {
  els.sam3ConfVal.textContent = Number(els.sam3ConfInput.value).toFixed(2);
  scheduleSaveSettings();
});
els.minAreaInput.addEventListener("input", () => {
  els.minAreaVal.textContent = els.minAreaInput.value;
  scheduleSaveSettings();
});
els.maxElemsInput.addEventListener("input", () => {
  els.maxElemsVal.textContent = els.maxElemsInput.value;
  scheduleSaveSettings();
});
els.jsonPreview.addEventListener("input", applyJsonDraft);
window.addEventListener("pointermove", updateDrag);
window.addEventListener("pointerup", stopDrag);
window.addEventListener("mousemove", updateDrag);
window.addEventListener("mouseup", stopDrag);

for (const eventName of ["dragenter", "dragover"]) {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("drag-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("drag-over");
  });
}

els.dropzone.addEventListener("drop", (event) => {
  handleFiles(event.dataTransfer.files);
});

for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.tab-btn')) {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
      document.getElementById(b.dataset.tab).hidden = !active;
    }
  });
}

els.generatePromptBtn.addEventListener("click", async () => {
  const prompt = els.textPromptInput.value.trim();
  if (!prompt) return;
  await generateAndAddToQueue(prompt, state.styleModel, els.generateError, els.generatePromptBtn);
});

els.addDialogClose.addEventListener("click", () => els.addDialog.close());
els.addDialog.addEventListener("click", (e) => { if (e.target === els.addDialog) els.addDialog.close(); });
els.addGenerateBtn.addEventListener("click", async () => {
  const prompt = els.addPromptInput.value.trim();
  if (!prompt) return;
  const ok = await generateAndAddToQueue(prompt, state.styleModel, els.addGenerateError, els.addGenerateBtn);
  if (ok) {
    els.addDialog.close();
    els.addPromptInput.value = "";
  }
});
els.addPickFileBtn.addEventListener("click", () => { els.addDialog.close(); els.fileInput.click(); });
els.addPickFolderBtn.addEventListener("click", () => { els.addDialog.close(); els.folderInput.click(); });

loadSettingsFromServer();
updateJson();
renderQueue();
