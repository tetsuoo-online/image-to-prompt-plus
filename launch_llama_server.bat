@echo off
:: ============================================================
:: llama-server launcher
:: ============================================================
setlocal

set "MODEL_KEY=qwen3-vl-8b"

if "%HF_HOME%"=="" set "HF_HOME=%USERPROFILE%\.cache\huggingface"

if "%MODEL_KEY%"=="qwen3-vl-8b" (
    set "REPO_DIR=%HF_HOME%\hub\models--unsloth--Qwen3-VL-8B-Instruct-1M-GGUF"
    set "GGUF_NAME=Qwen3-VL-8B-Instruct-1M-Q6_K.gguf"
    set "MMPROJ_NAME=mmproj-BF16.gguf"
)

for /r "%REPO_DIR%" %%f in (%GGUF_NAME%)   do set "GGUF_PATH=%%f"
for /r "%REPO_DIR%" %%f in (%MMPROJ_NAME%) do set "MMPROJ_PATH=%%f"

if "%GGUF_PATH%"=="" (
    echo [ERROR] GGUF introuvable dans %REPO_DIR%
    echo Lancer d abord download_models.bat
    pause & exit /b 1
)

echo [llama-server] Modele : %MODEL_KEY%
echo [llama-server] GGUF   : %GGUF_PATH%
echo [llama-server] mmproj : %MMPROJ_PATH%

X:\llama.cpp\llama-server.exe ^
    --model "%GGUF_PATH%" ^
    --mmproj "%MMPROJ_PATH%" ^
    --port 8080 --host 127.0.0.1 ^
    --ctx-size 4096 --n-gpu-layers 99 --no-mmap
endlocal
