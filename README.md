# image-to-prompt-plus

A modified version of [cocktailpeanut/image-to-prompt](https://github.com/cocktailpeanut/image-to-prompt) — a local web app that turns images into editable [Ideogram 4](https://ideogram.ai) JSON prompts.

This fork removes the Pinokio launcher and adds multimodal LLM support for richer, more accurate prompt generation.

## What's added

- **Multimodal LLM integration** via [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`): select a vision model to generate `high_level_description`, `background`, and all `style_description` fields (aesthetics, lighting, art style, medium, color palette)
- **Qwen 3-VL 8B Q6_K** ([unsloth/Qwen3-VL-8B-Instruct-1M-GGUF](https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-1M-GGUF)) as the default style model — runs on a GPU with 8 GB+ VRAM
- **Auto-managed llama-server**: the app starts and stops the llama-server process automatically when needed — no separate launcher required
- **Florence-2-large-ft** as the default Florence-2 model (instead of base-ft) for better detection and captions
- **Compact JSON toggle** in the output panel
- **Stop button** to cancel an ongoing analysis
- `download_models.bat` — downloads GGUF model files into the Hugging Face cache
- `launch_app.bat` — convenience launcher for Windows

## Requirements

- Windows (tested), Python 3.11+
- NVIDIA GPU recommended (CUDA 12.x) — Florence-2 and llama-server both benefit from GPU
- [llama-server](https://github.com/ggml-org/llama.cpp/releases) binary somewhere on your system

## Install

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Install PyTorch for CUDA 12.x:

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

## Download models

Run `download_models.bat` to download the Qwen 3-VL 8B GGUF files into your Hugging Face cache. Set `HF_HOME` beforehand if your cache is not at the default location.

## Configure

Edit the top of `app.py` (or set environment variables) to point to your llama-server binary:

| Variable | Default |
|---|---|
| `LLAMA_SERVER_EXE` | `X:\llama.cpp\llama-server.exe` |
| `HF_HOME` | `%USERPROFILE%\.cache\huggingface` |
| `FLORENCE_MODEL` | `microsoft/Florence-2-large-ft` |
| `LLAMA_SERVER_URL` | `http://localhost:8080` |

## Run

```powershell
venv\Scripts\python.exe app.py
```

Or double-click `launch_app.bat`.

Then open `http://127.0.0.1:7860`.

## How it works

1. **Florence-2** handles object detection, region captions, OCR, and dominant color palette
2. **Qwen 3-VL** (optional) generates a literal scene description, background, and structured style fields
3. The UI merges both into an editable Ideogram 4 JSON prompt

Select **None (Florence-2 only)** in the Style model dropdown to skip the LLM step entirely.
