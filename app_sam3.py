import argparse
import asyncio
import base64
import io
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"

DEFAULT_FLORENCE_MODEL = os.environ.get("FLORENCE_MODEL", "microsoft/Florence-2-large-ft")


def load_settings() -> dict[str, Any]:
    p = APP_DIR / "settings.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

_settings: dict[str, Any] = load_settings()
MOCK_MODE = os.environ.get("IMAGE_TO_PROMPT_MOCK", "").lower() in ("1", "true", "yes")
LLAMA_SERVER_URL = os.environ.get("LLAMA_SERVER_URL", "http://localhost:8080").rstrip("/")
HF_HOME = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))

_exe_default = shutil.which("llama-server") or r"X:\llama.cpp\llama-server.exe"
LLAMA_SERVER_EXE = Path(os.environ.get("LLAMA_SERVER_EXE", _exe_default))
LLAMA_STARTUP_TIMEOUT = int(os.environ.get("LLAMA_STARTUP_TIMEOUT", "90"))

MLLM_SPECS: dict[str, tuple[str, str, str]] = {
    "qwen3-vl-8b": (
        "unsloth/Qwen3-VL-8B-Instruct-1M-GGUF",
        "Qwen3-VL-8B-Instruct-1M-Q6_K.gguf",
        "mmproj-BF16.gguf",
    ),
}

STYLE_SYSTEM_PROMPT = """You are a visual analyst for Ideogram 4.
Analyze the image and return ONLY a JSON object with these exact keys:
{
  "high_level_description": "literal, precise description of exactly what is visually present: subjects with their physical appearance (clothing, hair color, body position), actions, and key objects. No metaphors, no mood, no interpretation — only what you literally see.",
  "background": "concise description of the background, setting, and environment",
  "aesthetics": "brief comma-separated aesthetic descriptors",
  "lighting": "brief lighting description",
  "medium": "medium type (e.g. digital illustration, photograph, oil painting)",
  "art_style": "specific art style name or movement (e.g. anime, watercolor, comic book, oil painting, concept art)",
  "is_photo": false,
  "color_palette": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"]
}
Rules:
- is_photo: true only for real photographs, false for all illustrations/drawings/renders/art
- color_palette: exactly 5 dominant hex colors, uppercase
- art_style: MANDATORY for every non-photo — always provide a specific style name; if unsure use the closest term (e.g. "digital art", "illustration", "anime", "concept art", "cartoon"); leave empty ONLY when is_photo is true
- high_level_description: factual and literal only — no interpretation, no atmosphere, no metaphor
- background: always filled, never empty
- Be concise and specific. No explanations outside JSON."""

app = FastAPI(title="Image to Prompt (SAM 3)", version="2.0.0-sam3")


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: dict[str, Any]):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response


@dataclass
class FlorenceRuntime:
    model: Any
    processor: Any
    torch: Any
    device: str
    dtype: Any


@dataclass
class Sam3Runtime:
    model: Any
    processor: Any
    device: str


_runtime_lock = threading.Lock()
_runtime: FlorenceRuntime | None = None

_sam3_lock = threading.Lock()
_sam3_runtime: Sam3Runtime | None = None


def log_progress(request_id: str | None = None, message: str = "") -> None:
    prefix = f"{request_id}" if request_id else "Image to Prompt SAM3"
    print(f"{prefix}: {message}", flush=True)


@contextmanager
def progress_stage(request_id: str | None = None, label: str = ""):
    started_at = time.perf_counter()
    log_progress(request_id, f"{label}...")
    try:
        yield
    except Exception:
        elapsed = time.perf_counter() - started_at
        log_progress(request_id, f"{label} failed after {elapsed:.1f}s")
        raise
    else:
        elapsed = time.perf_counter() - started_at
        log_progress(request_id, f"{label} done in {elapsed:.1f}s")


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def image_to_base64(image: "Image.Image", max_dim: int = 1024) -> str:
    w, h = image.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return base64.b64encode(out.getvalue()).decode()


def load_image(data: bytes) -> "Image.Image":
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Upload a valid image file.") from exc
    if image.width < 1 or image.height < 1:
        raise HTTPException(status_code=400, detail="Upload a non-empty image.")
    return image


def normalize_bbox_xyxy(box: list[float], width: int, height: int) -> list[int]:
    x1, y1, x2, y2 = [float(v) for v in box[:4]]
    x1, x2 = clamp(x1, 0, width), clamp(x2, 0, width)
    y1, y2 = clamp(y1, 0, height), clamp(y2, 0, height)
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    return [round(y1 / height * 1000), round(x1 / width * 1000),
            round(y2 / height * 1000), round(x2 / width * 1000)]


def bbox_area(bbox: list[int]) -> int:
    y1, x1, y2, x2 = bbox
    return max(0, y2 - y1) * max(0, x2 - x1)


def bbox_iou(a: list[int], b: list[int]) -> float:
    ay1, ax1, ay2, ax2 = a
    by1, bx1, by2, bx2 = b
    iy1, ix1 = max(ay1, by1), max(ax1, bx1)
    iy2, ix2 = min(ay2, by2), min(ax2, bx2)
    inter = bbox_area([iy1, ix1, iy2, ix2])
    denom = bbox_area(a) + bbox_area(b) - inter
    return inter / denom if denom else 0.0


def slug_label(label: str) -> str:
    label = re.sub(r"\s*\(pad\)\s*", " ", label or "", flags=re.IGNORECASE)
    label = re.sub(r"\s+", " ", label, flags=re.IGNORECASE)
    label = re.sub(r"[^\w\s]", "", label or "").strip()
    label = re.sub(r"\s+", " ", label)
    return label or "object"


def sample_color(image: "Image.Image", bbox: list[int]) -> str:
    y1, x1, y2, x2 = bbox
    left, top = int(x1 / 1000 * image.width), int(y1 / 1000 * image.height)
    right = max(left + 1, int(x2 / 1000 * image.width))
    bottom = max(top + 1, int(y2 / 1000 * image.height))
    crop = image.crop((left, top, right, bottom)).resize((1, 1), Image.Resampling.BILINEAR)
    r, g, b = crop.getpixel((0, 0))
    return f"#{r:02X}{g:02X}{b:02X}"


def dominant_palette(image: "Image.Image", count: int = 5) -> list[str]:
    small = image.resize((80, 80), Image.Resampling.BILINEAR)
    arr = np.asarray(small).reshape(-1, 3)
    if arr.size == 0:
        return []
    bins = np.clip(arr // 32 * 32 + 16, 0, 255).astype(np.uint8)
    colors, counts = np.unique(bins, axis=0, return_counts=True)
    order = np.argsort(-counts)[:count]
    return [f"#{r:02X}{g:02X}{b:02X}" for r, g, b in colors[order]]


def build_ideogram_json(
    caption: str,
    background: str,
    elements: list[dict[str, Any]],
    palette: list[str],
    style_description: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_caption = caption.strip() or "Uploaded image scene."
    bg = background.strip() or "Background and setting inferred from the uploaded image."
    ordered = []
    for idx, item in enumerate(elements, start=1):
        item_type = item.get("type") if item.get("type") in ("obj", "text") else "obj"
        bbox = [int(v) for v in item["bbox"][:4]]
        desc = (item.get("description") or item.get("label") or f"object {idx}").strip()
        if item_type == "text":
            text = (item.get("text") or item.get("label") or desc).strip()
            ordered.append({"type": "text", "bbox": bbox, "text": text,
                            "desc": desc or f"Text reading {text!r}."})
        else:
            ordered.append({"type": "obj", "bbox": bbox, "desc": desc})
    prompt: dict[str, Any] = {"high_level_description": clean_caption}
    if style_description:
        prompt["style_description"] = style_description
    prompt["compositional_deconstruction"] = {"background": bg, "elements": ordered}
    return prompt


# ── Florence-2 ────────────────────────────────────────────────────────────────

def get_runtime(request_id: str | None = None) -> FlorenceRuntime:
    global _runtime
    if _runtime is not None:
        return _runtime
    with _runtime_lock:
        if _runtime is not None:
            return _runtime
        if MOCK_MODE:
            raise RuntimeError("Mock mode does not load Florence-2.")
        with progress_stage(request_id, f"Loading Florence-2 {DEFAULT_FLORENCE_MODEL}"):
            import torch
            from transformers import AutoModelForCausalLM, AutoProcessor
            if torch.cuda.is_available():
                device, dtype = "cuda", torch.float16
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                device, dtype = "mps", torch.float32
                torch.mps.set_per_process_memory_fraction(0.5)
            else:
                device, dtype = "cpu", torch.float32
            log_progress(request_id, f"Using device={device}, dtype={dtype}")
            model = AutoModelForCausalLM.from_pretrained(
                DEFAULT_FLORENCE_MODEL, trust_remote_code=True, torch_dtype=dtype).to(device)
            model.eval()
            processor = AutoProcessor.from_pretrained(DEFAULT_FLORENCE_MODEL, trust_remote_code=True)
            _runtime = FlorenceRuntime(model=model, processor=processor,
                                       torch=torch, device=device, dtype=dtype)
    return _runtime


def release_accelerator_cache(rt: FlorenceRuntime) -> None:
    if rt.device == "mps":
        rt.torch.mps.empty_cache()
    elif rt.device == "cuda":
        rt.torch.cuda.empty_cache()


def run_florence_task(image: "Image.Image", task: str, label: str, request_id: str) -> dict[str, Any]:
    with progress_stage(request_id, label):
        rt = get_runtime(request_id)
        inputs = rt.processor(text=task, images=image, return_tensors="pt")
        moved: dict[str, Any] = {}
        for key, value in inputs.items():
            if hasattr(value, "to"):
                value = value.to(rt.device)
            if key == "pixel_values":
                value = value.to(rt.dtype)
            moved[key] = value
        try:
            with rt.torch.inference_mode():
                generated_ids = rt.model.generate(
                    input_ids=moved["input_ids"], pixel_values=moved["pixel_values"],
                    max_new_tokens=1024, num_beams=3, early_stopping=False)
            generated_text = rt.processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
            result = rt.processor.post_process_generation(
                generated_text, task=task, image_size=(image.width, image.height))
            del generated_ids
            return result
        finally:
            del inputs, moved
            release_accelerator_cache(rt)


def extract_task_value(result: dict[str, Any], task: str) -> Any:
    if task in result:
        return result[task]
    return next(iter(result.values()), None)


def parse_florence(image: "Image.Image", request_id: str) -> tuple[str, str, list[dict[str, Any]]]:
    caption_result = extract_task_value(
        run_florence_task(image, "<MORE_DETAILED_CAPTION>", "Generating detailed caption", request_id),
        "<MORE_DETAILED_CAPTION>")
    caption = caption_result if isinstance(caption_result, str) else ""
    dense_result = extract_task_value(
        run_florence_task(image, "<DENSE_REGION_CAPTION>", "Detecting dense regions", request_id),
        "<DENSE_REGION_CAPTION>")
    od_result = extract_task_value(
        run_florence_task(image, "<OD>", "Detecting objects", request_id), "<OD>")
    ocr_result = extract_task_value(
        run_florence_task(image, "<OCR_WITH_REGION>", "Running OCR with regions", request_id),
        "<OCR_WITH_REGION>")

    min_area = _settings.get("min_bbox_area", 40)
    min_ocr_area = _settings.get("min_ocr_area", 20)
    max_elements = _settings.get("max_elements", 40)
    iou_threshold = _settings.get("dedup_iou_threshold", 0.7)

    dense_items = []
    if isinstance(dense_result, dict):
        for label, box in zip(dense_result.get("labels", []), dense_result.get("bboxes", []), strict=False):
            bbox = normalize_bbox_xyxy(box, image.width, image.height)
            if bbox_area(bbox) > min_area:
                dense_items.append({"label": slug_label(label), "description": slug_label(label), "bbox": bbox})

    elements: list[dict[str, Any]] = []
    if isinstance(od_result, dict):
        for label, box in zip(od_result.get("labels", []), od_result.get("bboxes", []), strict=False):
            bbox = normalize_bbox_xyxy(box, image.width, image.height)
            if bbox_area(bbox) < min_area:
                continue
            desc = slug_label(label)
            best_dense = max(dense_items, key=lambda item: bbox_iou(bbox, item["bbox"]), default=None)
            if best_dense and bbox_iou(bbox, best_dense["bbox"]) > 0.2:
                desc = best_dense["description"]
            elements.append({"id": f"item-{len(elements)+1}", "type": "obj",
                              "label": slug_label(label), "description": desc,
                              "bbox": bbox, "color": sample_color(image, bbox)})

    if not elements:
        for item in dense_items[:20]:
            elements.append({"id": f"item-{len(elements)+1}", "type": "obj",
                              "label": item["label"], "description": item["description"],
                              "bbox": item["bbox"], "color": sample_color(image, item["bbox"])})

    if isinstance(ocr_result, dict):
        quad_boxes = ocr_result.get("quad_boxes") or ocr_result.get("bboxes")
        for label, box in zip(ocr_result.get("labels", []), quad_boxes, strict=False):
            coords = [float(v) for v in box]
            if len(coords) >= 8:
                xs, ys = coords[0::2], coords[1::2]
                xyxy = [min(xs), min(ys), max(xs), max(ys)]
            else:
                xyxy = coords[:4]
            bbox = normalize_bbox_xyxy(xyxy, image.width, image.height)
            text = slug_label(label)
            if bbox_area(bbox) > min_ocr_area and text:
                elements.append({"id": f"item-{len(elements)+1}", "type": "text",
                                  "label": text, "text": text, "description": f"text {text!r}",
                                  "bbox": bbox, "color": sample_color(image, bbox)})

    seen: list[dict[str, Any]] = []
    for element in sorted(elements, key=lambda e: (e["bbox"][0], e["bbox"][1])):
        if not any(bbox_iou(element["bbox"], other["bbox"]) > iou_threshold for other in seen):
            element["id"] = f"item-{len(seen)+1}"
            seen.append(element)

    background = caption or "Background and setting inferred from the uploaded image."
    return caption, background, seen[:max_elements]


# ── SAM 3 ─────────────────────────────────────────────────────────────────────

def find_sam3_checkpoint() -> Path | None:
    repo_dir = HF_HOME / "hub" / "models--facebook--sam3"
    if repo_dir.exists():
        for p in sorted(repo_dir.rglob("sam3.pt")):
            return p
    return None


def get_sam3_runtime(request_id: str | None = None) -> Sam3Runtime:
    global _sam3_runtime
    if _sam3_runtime is not None:
        return _sam3_runtime
    with _sam3_lock:
        if _sam3_runtime is not None:
            return _sam3_runtime
        with progress_stage(request_id, "Loading SAM 3"):
            import torch
            from sam3 import model_builder as _sam3_mb
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor
            checkpoint = find_sam3_checkpoint()
            if checkpoint is None:
                raise RuntimeError(
                    "SAM 3 checkpoint not found in HF cache. "
                    f"Expected at {HF_HOME}/hub/models--facebook--sam3/**/sam3.pt"
                )
            bpe_path = Path(_sam3_mb.__file__).parent / "assets" / "bpe_simple_vocab_16e6.txt.gz"
            log_progress(request_id, f"SAM 3 checkpoint: {checkpoint}")
            log_progress(request_id, f"SAM 3 bpe: {bpe_path}")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model = build_sam3_image_model(
                bpe_path=str(bpe_path),
                checkpoint_path=str(checkpoint),
                load_from_HF=False,
                device=device,
            )
            processor = Sam3Processor(model, device=device)
            _sam3_runtime = Sam3Runtime(model=model, processor=processor, device=device)
    return _sam3_runtime


def detect_with_sam3(
    image: "Image.Image",
    od_labels: list[str],
    od_bboxes: list[list[int]],
    request_id: str,
) -> list[dict[str, Any]]:
    """Query SAM 3 for each unique Florence OD label to get precise bboxes.
    Falls back to Florence bbox if SAM 3 confidence is too low."""
    rt = get_sam3_runtime(request_id)

    autocast_ctx = (
        torch.autocast("cuda", dtype=torch.bfloat16)
        if rt.device == "cuda"
        else torch.autocast("cpu", dtype=torch.bfloat16, enabled=False)
    )

    with progress_stage(request_id, "SAM 3: encoding image"):
        with autocast_ctx:
            inference_state = rt.processor.set_image(image)

    florence_by_label: dict[str, list[list[int]]] = {}
    for label, bbox in zip(od_labels, od_bboxes):
        florence_by_label.setdefault(label, []).append(bbox)

    results: list[dict[str, Any]] = []
    unique_labels = list(dict.fromkeys(od_labels))

    for label in unique_labels:
        with progress_stage(request_id, f"SAM 3: '{label}'"):
            with autocast_ctx:
                output = rt.processor.set_text_prompt(prompt=label, state=inference_state)

        boxes = output.get("boxes", [])
        scores = output.get("scores", [])

        if hasattr(boxes, "tolist"):
            boxes = boxes.tolist()
        if hasattr(scores, "tolist"):
            scores = scores.tolist()

        sam3_confidence = _settings.get("sam3_confidence_threshold", 0.3)
        min_area = _settings.get("min_bbox_area", 40)
        found_any = False
        for box, score in zip(boxes, scores):
            if score > sam3_confidence:
                bbox = normalize_bbox_xyxy(box, image.width, image.height)
                if bbox_area(bbox) > min_area:
                    results.append({"label": label, "bbox": bbox, "score": float(score)})
                    found_any = True

        if not found_any:
            for bbox in florence_by_label.get(label, []):
                results.append({"label": label, "bbox": bbox, "score": 0.0})

    return results


def parse_florence_with_sam3(
    image: "Image.Image", request_id: str
) -> tuple[str, str, list[dict[str, Any]]]:
    caption_result = extract_task_value(
        run_florence_task(image, "<MORE_DETAILED_CAPTION>", "Generating detailed caption", request_id),
        "<MORE_DETAILED_CAPTION>")
    caption = caption_result if isinstance(caption_result, str) else ""

    dense_result = extract_task_value(
        run_florence_task(image, "<DENSE_REGION_CAPTION>", "Detecting dense regions", request_id),
        "<DENSE_REGION_CAPTION>")

    od_result = extract_task_value(
        run_florence_task(image, "<OD>", "Detecting objects (labels for SAM 3)", request_id), "<OD>")

    ocr_result = extract_task_value(
        run_florence_task(image, "<OCR_WITH_REGION>", "Running OCR with regions", request_id),
        "<OCR_WITH_REGION>")

    min_area = _settings.get("min_bbox_area", 40)
    min_ocr_area = _settings.get("min_ocr_area", 20)
    max_elements = _settings.get("max_elements", 40)

    dense_items = []
    if isinstance(dense_result, dict):
        for label, box in zip(dense_result.get("labels", []), dense_result.get("bboxes", []), strict=False):
            bbox = normalize_bbox_xyxy(box, image.width, image.height)
            if bbox_area(bbox) > min_area:
                dense_items.append({"label": slug_label(label), "description": slug_label(label), "bbox": bbox})

    elements: list[dict[str, Any]] = []

    if isinstance(od_result, dict) and od_result.get("labels"):
        od_labels_raw = od_result.get("labels", [])
        od_bboxes_raw = od_result.get("bboxes", [])

        od_labels, od_bboxes = [], []
        for label, box in zip(od_labels_raw, od_bboxes_raw):
            bbox = normalize_bbox_xyxy(box, image.width, image.height)
            if bbox_area(bbox) >= min_area:
                od_labels.append(slug_label(label))
                od_bboxes.append(bbox)

        if od_labels:
            sam3_results = detect_with_sam3(image, od_labels, od_bboxes, request_id)

            for item in sam3_results:
                bbox = item["bbox"]
                label = item["label"]
                desc = label
                best_dense = max(dense_items, key=lambda d: bbox_iou(bbox, d["bbox"]), default=None)
                if best_dense and bbox_iou(bbox, best_dense["bbox"]) > 0.2:
                    desc = best_dense["description"]
                elements.append({
                    "id": f"item-{len(elements)+1}", "type": "obj",
                    "label": label, "description": desc,
                    "bbox": bbox, "color": sample_color(image, bbox),
                    "_sam3_score": item["score"],
                })

    if not elements:
        for item in dense_items[:20]:
            elements.append({
                "id": f"item-{len(elements)+1}", "type": "obj",
                "label": item["label"], "description": item["description"],
                "bbox": item["bbox"], "color": sample_color(image, item["bbox"]),
            })

    if isinstance(ocr_result, dict):
        quad_boxes = ocr_result.get("quad_boxes") or ocr_result.get("bboxes")
        for label, box in zip(ocr_result.get("labels", []), quad_boxes, strict=False):
            coords = [float(v) for v in box]
            if len(coords) >= 8:
                xs, ys = coords[0::2], coords[1::2]
                xyxy = [min(xs), min(ys), max(xs), max(ys)]
            else:
                xyxy = coords[:4]
            bbox = normalize_bbox_xyxy(xyxy, image.width, image.height)
            text = slug_label(label)
            if bbox_area(bbox) > min_ocr_area and text:
                elements.append({
                    "id": f"item-{len(elements)+1}", "type": "text",
                    "label": text, "text": text, "description": f"text {text!r}",
                    "bbox": bbox, "color": sample_color(image, bbox),
                })

    iou_threshold = _settings.get("dedup_iou_threshold", 0.7)
    # Sort highest SAM3 score first so the best detection wins when two overlap
    seen: list[dict[str, Any]] = []
    for element in sorted(elements, key=lambda e: (-e.get("_sam3_score", 0.0), e["bbox"][0], e["bbox"][1])):
        if not any(bbox_iou(element["bbox"], other["bbox"]) > iou_threshold for other in seen):
            element["id"] = f"item-{len(seen)+1}"
            seen.append(element)

    # Re-sort final list by position (top→bottom, left→right) for readability
    seen.sort(key=lambda e: (e["bbox"][0], e["bbox"][1]))
    for idx, e in enumerate(seen, start=1):
        e["id"] = f"item-{idx}"

    background = caption or "Background and setting inferred from the uploaded image."
    return caption, background, seen[:max_elements]


# ── MLLM style analysis via llama-server ─────────────────────────────────────

def find_gguf_in_hf_cache(repo_id: str, filename: str) -> "Path | None":
    repo_key = "models--" + repo_id.replace("/", "--")
    for base in [HF_HOME / "hub" / repo_key, HF_HOME / repo_key]:
        if base.exists():
            for p in base.rglob(filename):
                return p
    llama_cache = os.environ.get("LLAMA_CACHE")
    if llama_cache:
        for p in Path(llama_cache).rglob(filename):
            return p
    return None


def resolve_mllm_model(model_key: str) -> dict[str, Any] | None:
    if model_key not in MLLM_SPECS:
        return None
    repo_id, gguf_name, mmproj_name = MLLM_SPECS[model_key]
    gguf_path = find_gguf_in_hf_cache(repo_id, gguf_name)
    mmproj_path = find_gguf_in_hf_cache(repo_id, mmproj_name)
    return {
        "model_key": model_key, "repo_id": repo_id,
        "gguf_name": gguf_name, "mmproj_name": mmproj_name,
        "gguf_path": str(gguf_path) if gguf_path else None,
        "mmproj_path": str(mmproj_path) if mmproj_path else None,
        "available": gguf_path is not None,
    }


def parse_style_json(raw: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group())
    except json.JSONDecodeError:
        return None
    is_photo = bool(data.get("is_photo", False))
    palette = []
    for c in (data.get("color_palette") or data.get("colorpalette") or []):
        c = str(c).strip().upper()
        if re.match(r"^#?[0-9A-F]{6}$", c):
            palette.append(c if c.startswith("#") else f"#{c}")
    palette = palette[:5]
    if is_photo:
        style: dict[str, Any] = {
            "aesthetics": str(data.get("aesthetics", "")).strip(),
            "lighting": str(data.get("lighting", "")).strip(),
            "photo": str(data.get("art_style") or "source-image composition preserved").strip(),
            "medium": str(data.get("medium", "photograph")).strip(),
        }
    else:
        style = {
            "aesthetics": str(data.get("aesthetics", "")).strip(),
            "lighting": str(data.get("lighting", "")).strip(),
            "medium": str(data.get("medium", "digital illustration")).strip(),
            "art_style": str(data.get("art_style", "")).strip(),
        }
    if palette:
        style["color_palette"] = palette
    return {
        "style": style,
        "high_level_description": str(data.get("high_level_description", "")).strip(),
        "background": str(data.get("background", "")).strip(),
    }


class LlamaServerManager:
    def __init__(self) -> None:
        self._process: subprocess.Popen | None = None
        self._current_model: str | None = None
        self._lock = threading.Lock()

    def _probe(self) -> bool:
        try:
            r = httpx.get(f"{LLAMA_SERVER_URL}/health", timeout=2.0)
            return r.status_code == 200
        except Exception:
            return False

    def _stop(self, request_id: str | None = None) -> None:
        if self._process and self._process.poll() is None:
            log_progress(request_id, "Stopping llama-server...")
            self._process.terminate()
            try:
                self._process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait()
        self._process = None
        self._current_model = None

    def _start(self, model_key: str, request_id: str | None = None) -> bool:
        info = resolve_mllm_model(model_key)
        if not info or not info.get("available"):
            log_progress(request_id, f"Model {model_key} not available in cache")
            return False
        if not info.get("mmproj_path"):
            log_progress(request_id, f"mmproj for {model_key} not found — download it first")
            return False
        if not LLAMA_SERVER_EXE.exists():
            log_progress(request_id, f"llama-server not found at {LLAMA_SERVER_EXE} — set LLAMA_SERVER_EXE")
            return False
        cmd = [
            str(LLAMA_SERVER_EXE),
            "--model", info["gguf_path"],
            "--mmproj", info["mmproj_path"],
            "--port", "8080", "--host", "127.0.0.1",
            "--ctx-size", "4096", "--n-gpu-layers", "99", "--no-mmap",
        ]
        log_progress(request_id, f"Starting llama-server with {model_key}...")
        self._process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.perf_counter() + LLAMA_STARTUP_TIMEOUT
        while time.perf_counter() < deadline:
            time.sleep(2)
            if self._process.poll() is not None:
                log_progress(request_id, "llama-server exited prematurely")
                return False
            if self._probe():
                self._current_model = model_key
                log_progress(request_id, f"llama-server ready with {model_key}")
                return True
        log_progress(request_id, "llama-server startup timeout")
        self._stop()
        return False

    def ensure_model(self, model_key: str, request_id: str | None = None) -> bool:
        with self._lock:
            if self._current_model == model_key and self._process and self._process.poll() is None:
                return True
            if self._probe():
                if self._current_model == model_key:
                    return True
                if self._process is None:
                    # Server running but we don't own it (external or other app instance)
                    # Adopt it rather than trying to restart it
                    log_progress(request_id, f"Adopting existing llama-server for {model_key}")
                    self._current_model = model_key
                    return True
                self._stop(request_id)
            return self._start(model_key, request_id)


_llama_manager = LlamaServerManager()


async def analyze_style(image: "Image.Image", model_key: str, request_id: str) -> dict[str, Any] | None:
    if model_key == "none":
        return None
    with progress_stage(request_id, f"Ensuring llama-server ({model_key})"):
        ready = await asyncio.get_running_loop().run_in_executor(
            None, _llama_manager.ensure_model, model_key, request_id)
    if not ready:
        log_progress(request_id, f"llama-server not available for {model_key} — skipping style")
        return None
    b64 = image_to_base64(image, max_dim=768)
    payload = {
        "model": model_key, "max_tokens": 512, "temperature": 0.1,
        "messages": [
            {"role": "system", "content": STYLE_SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": "Analyze the style of this image."},
            ]},
        ],
    }
    with progress_stage(request_id, f"Style analysis via llama-server ({model_key})"):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{LLAMA_SERVER_URL}/v1/chat/completions",
                    json=payload, headers={"Content-Type": "application/json"})
            if response.status_code != 200:
                log_progress(request_id, f"llama-server {response.status_code}: {response.text[:200]}")
                return None
            raw = response.json()["choices"][0]["message"]["content"]
            style = parse_style_json(raw)
            if not style:
                log_progress(request_id, f"Could not parse style JSON: {raw[:200]}")
            return style
        except httpx.ConnectError:
            log_progress(request_id, "llama-server connection lost — skipping style")
            return None
        except Exception as exc:
            log_progress(request_id, f"Style analysis failed: {exc}")
            return None


# ── Mock ──────────────────────────────────────────────────────────────────────

def mock_parse(image: "Image.Image") -> tuple[str, str, list[dict[str, Any]]]:
    caption = "Four cats resting together on a sofa in a softly lit room."
    boxes = [[290, 70, 720, 300], [260, 290, 760, 510], [270, 500, 740, 730], [300, 700, 760, 930]]
    elements = []
    for idx, bbox in enumerate(boxes, start=1):
        elements.append({"id": f"item-{idx}", "type": "obj", "label": f"cat {idx}",
                          "description": f"cat {idx}", "bbox": bbox,
                          "color": sample_color(image, bbox)})
    return caption, "A sofa and room background behind the four cats.", elements


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/settings")
def settings_route() -> dict[str, Any]:
    return _settings


@app.post("/api/settings")
async def update_settings(request: Request) -> dict[str, Any]:
    global _settings
    data = await request.json()
    _settings.update({k: v for k, v in data.items() if v is not None})
    (APP_DIR / "settings.json").write_text(
        json.dumps(_settings, indent=2) + "\n", encoding="utf-8"
    )
    return _settings


@app.get("/health")
def health() -> dict[str, Any]:
    sam3_ckpt = find_sam3_checkpoint()
    return {
        "ok": True,
        "mode": "florence2 + sam3",
        "florence_model": DEFAULT_FLORENCE_MODEL,
        "mock": MOCK_MODE,
        "florence_loaded": _runtime is not None,
        "sam3_loaded": _sam3_runtime is not None,
        "sam3_checkpoint": str(sam3_ckpt) if sam3_ckpt else None,
        "llama_server_url": LLAMA_SERVER_URL,
        "hf_home": str(HF_HOME),
        "mllm_models": {k: resolve_mllm_model(k) for k in MLLM_SPECS},
        "settings": _settings,
    }


@app.get("/api/mllm-models")
def mllm_models_route() -> dict[str, Any]:
    return {k: resolve_mllm_model(k) for k in MLLM_SPECS}


@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    style_model: str = Form(default="none"),
    caption_model: str = Form(default="florence2+sam3"),
) -> JSONResponse:
    request_id = uuid.uuid4().hex[:8]
    started_at = time.perf_counter()
    log_progress(request_id, f"Received: {file.filename or 'image'}, style_model={style_model!r}, caption_model={caption_model!r}")

    if not file.content_type or not file.content_type.startswith("image"):
        raise HTTPException(status_code=400, detail="Upload an image file.")

    try:
        with progress_stage(request_id, "Reading image"):
            image = load_image(await file.read())
        log_progress(request_id, f"Size {image.width}x{image.height}")

        if MOCK_MODE:
            with progress_stage(request_id, "Mock parser"):
                caption, background, elements = mock_parse(image)
        elif caption_model == "florence2+sam3":
            caption, background, elements = parse_florence_with_sam3(image, request_id)
        else:
            caption, background, elements = parse_florence(image, request_id)

        with progress_stage(request_id, "Dominant palette"):
            palette = dominant_palette(image)

        style_description = None
        if style_model != "none":
            qwen = await analyze_style(image, style_model, request_id)
            if qwen:
                style_description = qwen["style"]
                if qwen.get("high_level_description"):
                    caption = qwen["high_level_description"]
                if qwen.get("background"):
                    background = qwen["background"]

        prompt_json = build_ideogram_json(caption, background, elements, palette, style_description)

    except HTTPException:
        raise
    except Exception as exc:
        log_progress(request_id, f"Failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

    elapsed = time.perf_counter() - started_at
    log_progress(request_id, f"Done — {len(elements)} elements in {elapsed:.1f}s")

    if MOCK_MODE:
        model_label = "mock"
    elif caption_model == "florence2+sam3":
        model_label = f"{DEFAULT_FLORENCE_MODEL} + sam3"
    else:
        model_label = DEFAULT_FLORENCE_MODEL

    return JSONResponse({
        "image": {"width": image.width, "height": image.height},
        "model": model_label,
        "caption_model": caption_model,
        "style_model": style_model if style_description else "none",
        "caption": caption,
        "background": background,
        "palette": palette,
        "elements": elements,
        "json": prompt_json,
    })


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store, max-age=0"})


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", default=int(os.environ.get("PORT", 7861)), type=int)
    args = parser.parse_args()
    print(f"Image to Prompt SAM3 running at http://{args.host}:{args.port}", flush=True)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
