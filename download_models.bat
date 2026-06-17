@echo off
:: ============================================================
:: Telechargement des GGUF Qwen-VL via HF CLI
:: ============================================================
setlocal

if "%HF_HOME%"=="" set "HF_HOME=%USERPROFILE%\.cache\huggingface"

echo ============================================================
echo   1) Qwen 3-VL 8B    (Q6_K ~8 Go)
echo ============================================================
set /p CHOICE=Votre choix (1) :

if "%CHOICE%"=="1" goto qwen3
echo Choix invalide. & exit /b 1

:qwen3
call :dl3 & goto done

:dl3
echo [download] Qwen 3-VL 8B Q6_K...
hf download unsloth/Qwen3-VL-8B-Instruct-1M-GGUF ^
    "Qwen3-VL-8B-Instruct-1M-Q6_K.gguf" "mmproj-BF16.gguf" ^
    --cache-dir "%HF_HOME%\hub"
exit /b

:done
echo.
echo [download] Termine — cache : %HF_HOME%\hub
pause
endlocal
