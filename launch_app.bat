@echo off
:: ============================================================
:: Image to Prompt v2 — Launcher Windows
:: ============================================================
setlocal

set "SCRIPT_DIR=%~dp0"
set "VENV=%SCRIPT_DIR%venv"
set "PYTHON=%VENV%\Scripts\python.exe"

if "%HF_HOME%"=="" set "HF_HOME=%USERPROFILE%\.cache\huggingface"
if "%LLAMA_SERVER_URL%"=="" set "LLAMA_SERVER_URL=http://127.0.0.1:8080"
echo [launcher] HF_HOME           = %HF_HOME%
echo [launcher] LLAMA_SERVER_URL  = %LLAMA_SERVER_URL%

if not exist "%PYTHON%" (
    echo [launcher] Creating virtualenv...
    python -m venv "%VENV%"
    "%PYTHON%" -m pip install --upgrade pip
    "%PYTHON%" -m pip install -r "%SCRIPT_DIR%requirements.txt"
)
echo [launcher] Starting app on http://127.0.0.1:7860
"%PYTHON%" "%SCRIPT_DIR%app.py" --host 127.0.0.1 --port 7860
endlocal
