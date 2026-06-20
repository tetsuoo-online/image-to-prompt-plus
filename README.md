# image-to-prompt-plus

A modified version of [cocktailpeanut/image-to-prompt](https://github.com/cocktailpeanut/image-to-prompt) — a local web app that turns images into editable [Ideogram 4](https://ideogram.ai) JSON prompts.

This fork removes the Pinokio launcher and adds multimodal LLM support and SAM 3 segmentation for richer, more accurate prompt generation.

## What's added

- **SAM 3 integration**: optional second detection pass that replaces Florence-2 bounding boxes with SAM 3's more precise segmentation results — switchable at runtime via the **Caption model** dropdown
- **Multimodal LLM integration** via [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`): select a vision model to generate `high_level_description`, `background`, and all `style_description` fields (aesthetics, lighting, art style, medium, color palette)
- **Qwen 3-VL 8B Q6_K** ([unsloth/Qwen3-VL-8B-Instruct-1M-GGUF](https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-1M-GGUF)) as the default style model — runs on a GPU with 8 GB+ VRAM
- **Auto-managed llama-server**: the app starts and stops the llama-server process automatically when needed
- **Florence-2-large-ft** as the default Florence-2 model (instead of base-ft) for better detection and captions
- **Folder scan**: load an entire folder of images into the queue in one click
- **Image filename** displayed above the canvas, selectable for copy-paste
- **Compact JSON toggle** in the output panel
- **Stop button** to cancel an ongoing analysis
- `launch_app_sam3.bat` — convenience launcher for Windows

## Requirements

- Windows (tested), Python 3.13
- NVIDIA GPU recommended (CUDA 12.x, Ampere or newer for SAM 3 Flash Attention)
- [llama-server](https://github.com/ggml-org/llama.cpp/releases) binary somewhere on your system (only needed for the Style model feature)

## Install

```powershell
python -m venv venv
venv\Scripts\activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

For SAM 3 support, see **[docs/install_sam3_windows.md](docs/install_sam3_windows.md)** for the full setup guide including required patches.

## Download models

Download the Qwen 3-VL 8B GGUF files into your Hugging Face cache:

```powershell
huggingface-cli download unsloth/Qwen3-VL-8B-Instruct-1M-GGUF \
  Qwen3-VL-8B-Instruct-1M-Q6_K.gguf mmproj-BF16.gguf
```

Download the SAM 3 checkpoint:

```powershell
huggingface-cli download facebook/sam3
```

## Configure

Edit the top of `app_sam3.py` or set environment variables:

| Variable | Default |
|---|---|
| `LLAMA_SERVER_EXE` | `X:\llama.cpp\llama-server.exe` |
| `HF_HOME` | `%USERPROFILE%\.cache\huggingface` |
| `FLORENCE_MODEL` | `microsoft/Florence-2-large-ft` |
| `LLAMA_SERVER_URL` | `http://localhost:8080` |

## Run

```powershell
venv\Scripts\python.exe app_sam3.py
```

Or double-click `launch_app_sam3.bat`.

Then open `http://127.0.0.1:7861`.

## How it works

1. **Caption model** (switchable in the UI, persisted in `settings.json`):
   - *Florence-2 only* — object detection, region captions, OCR; fast, no extra VRAM
   - *Florence-2 + SAM 3* — Florence-2 supplies labels, SAM 3 refines bounding boxes with text-prompted segmentation for more precise spatial placement
2. **Style model** (optional): Qwen 3-VL or none — generates `high_level_description`, `background`, and structured `style_description` fields
3. The UI merges everything into an editable Ideogram 4 JSON prompt with draggable bounding boxes

Both models are lazy-loaded on first use and stay in VRAM for subsequent images.
