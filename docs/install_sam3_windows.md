# Installing SAM 3 on Windows

This documents the steps and workarounds required to run `app_sam3.py` on Windows with CUDA. SAM 3 was originally designed for Linux; several patches are needed to make it work on Windows.

---

## Hardware and software requirements

| Requirement | Minimum | Tested |
|---|---|---|
| GPU | NVIDIA Ampere (RTX 30xx) or newer | — |
| VRAM | ~8 GB | — |
| CUDA | 12.x | 12.8 |
| Python | 3.11+ | 3.11 |
| OS | Windows 10/11 | Windows 10 LTSC |

> **Flash Attention**: SAM 3 uses `bfloat16` autocast and Flash Attention internally. It falls back to standard SDPA on pre-Ampere GPUs, but performance will be significantly lower.

---

## Step 1 — Clone the SAM 3 repository

SAM 3 must be installed as an editable local package. Clone it **inside the project directory**:

```powershell
cd X:\image-to-prompt-plus_SAM3
git clone https://github.com/facebookresearch/sam3.git sam3
```

The result is `X:\image-to-prompt-plus_SAM3\sam3\` with the `sam3` Python package inside.

---

## Step 2 — Create the virtual environment

```powershell
python -m venv venv
venv\Scripts\activate
```

---

## Step 3 — Install PyTorch (CUDA 12.8)

Install the CUDA-enabled build first. The exact wheel must match your CUDA version:

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

Versions installed and tested: `torch 2.11.0+cu128`, `torchvision 0.26.0+cu128`.

For CUDA 12.1 or 12.4, replace `cu128` with `cu121` or `cu124` respectively.

Verify:

```powershell
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
# Expected: 2.11.0+cu128  True
```

---

## Step 4 — Install base requirements

```powershell
pip install -r requirements.txt
```

This installs FastAPI, Uvicorn, Florence-2 dependencies (transformers, timm, accelerate, sentencepiece), Pillow, httpx, etc.

---

## Step 5 — Install SAM 3 and its dependencies

```powershell
pip install -e ./sam3
pip install scipy torchvision
```

SAM 3's `pyproject.toml` lists these core dependencies: `timm>=1.0.17`, `numpy>=1.26,<2`, `tqdm`, `ftfy==6.1.1`, `regex`, `iopath>=0.1.10`, `huggingface_hub`.

`scipy` is not in the default deps list but is **required on Windows** (see patch below).  
`torchvision` is used by `Sam3Processor` for image transforms (`torchvision.transforms.v2`).

---

## Step 6 — Download the SAM 3 checkpoint

The app looks for the checkpoint in the Hugging Face cache:

```
%USERPROFILE%\.cache\huggingface\hub\models--facebook--sam3\**\sam3.pt
```

Download via `huggingface_hub`:

```python
from huggingface_hub import snapshot_download
snapshot_download("facebook/sam3", local_dir_use_symlinks=False)
```

Or via the CLI:

```powershell
huggingface-cli download facebook/sam3
```

If you use a custom HF cache location, set the environment variable:

```powershell
$env:HF_HOME = "D:\models\huggingface"
```

The `app_sam3.py` also reads `HF_HOME` from this variable and searches recursively for `sam3.pt`.

---

## Windows patches applied to SAM 3 source

These modifications were made directly to the files inside `sam3/sam3/`. If you re-clone SAM 3 from scratch, you'll need to reapply them.

### Patch 1 — `sam3/model/edt.py`: replace Triton with scipy

**Problem**: SAM 3's Euclidean Distance Transform uses a Triton GPU kernel. [Triton is not available on Windows](https://github.com/triton-lang/triton/issues/1640) — the import fails at startup.

**Fix**: Replace the entire `edt_triton` function body with a scipy fallback:

```python
# Before (imports triton, crashes on Windows):
import triton
import triton.language as tl
# ... Triton kernel code ...

# After — full file replacement:
import numpy as np
import torch
from scipy.ndimage import distance_transform_edt as scipy_edt

def edt_triton(data: torch.Tensor):
    """
    Fallback implementation using scipy (Triton not available on Windows).
    """
    assert data.dim() == 3
    device = data.device
    results = []
    for i in range(data.shape[0]):
        mask = data[i].bool().cpu().numpy()
        edt = scipy_edt(mask).astype(np.float32)
        results.append(torch.from_numpy(edt))
    return torch.stack(results).to(device)
```

The function name `edt_triton` is kept unchanged so the rest of the codebase can import it without modification. The scipy fallback runs on CPU per frame, which is slower than the Triton CUDA kernel but functionally identical.

### Patch 2 — `app_sam3.py`: safe `autocast` for CPU fallback

**Problem**: SAM 3's internal models use `torch.autocast(device_type="cuda", ...)` unconditionally. If the inference somehow runs on CPU, this raises an error.

**Fix**: `app_sam3.py` wraps SAM 3 calls with a conditional autocast:

```python
autocast_ctx = (
    torch.autocast("cuda", dtype=torch.bfloat16)
    if rt.device == "cuda"
    else torch.autocast("cpu", dtype=torch.bfloat16, enabled=False)
)
with autocast_ctx:
    inference_state = rt.processor.set_image(image)
```

This ensures that even if CUDA is unavailable, the code doesn't crash — it simply runs in float32 on CPU.

---

## Verifying the install

Start the app on port 7861:

```powershell
venv\Scripts\python.exe app_sam3.py
```

Then check the health endpoint:

```
http://127.0.0.1:7861/health
```

Expected response:

```json
{
  "ok": true,
  "mode": "florence2 + sam3",
  "florence_loaded": false,
  "sam3_loaded": false,
  "sam3_checkpoint": "C:\\Users\\...\\huggingface\\hub\\models--facebook--sam3\\...\\sam3.pt"
}
```

`sam3_checkpoint` must not be `null`. `florence_loaded` and `sam3_loaded` start as `false` and become `true` after the first image is processed (models are lazy-loaded).

---

## Shared llama-server with `app.py`

Both `app.py` (port 7860) and `app_sam3.py` (port 7861) can share the same `llama-server` process. The second app to start will detect the server already running on port 8080 and adopt it instead of trying to start a new one.

Do **not** run `launch_llama_server.bat` manually if you're using the auto-managed server — the app handles this automatically.

---

## Known limitations

- **Triton unavailable on Windows**: The EDT kernel runs on CPU via scipy, which is slower for large batches of masks. For typical use (single image, ~40 detected objects) the overhead is negligible.
- **Flash Attention 3 (`fa3`)**: `sam3.perflib.fa3` is not installed. SAM 3 falls back to PyTorch's built-in `scaled_dot_product_attention` with `SDPBackend.FLASH_ATTENTION`, which is available in PyTorch 2.x.
- **Multi-GPU**: Not supported in this integration. SAM 3 runs on a single CUDA device.
- **Pre-Ampere GPUs**: Flash Attention requires Ampere (compute capability 8.0+). On older GPUs, SAM 3 disables Flash Attention automatically and falls back to standard attention, but inference may be slower.
