; Loomora visual theme. These definitions are consumed by NSIS Modern UI
; before the assisted installer pages are created.
!define MUI_BGCOLOR "0B0818"
!define MUI_TEXTCOLOR "EEE8FA"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 Loomora"
!define MUI_WELCOMEPAGE_TEXT "将灵感织成画面。$\r$\n$\r$\n安装向导将帮助您完成设置。下一步可选择安装范围与位置。"
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择 Loomora 的安装位置。建议保留默认路径，也可以安装到其他磁盘。"
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "安装位置"
!define MUI_FINISHPAGE_TITLE "Loomora 已安装完成"
!define MUI_FINISHPAGE_TEXT "现在可以开始创作了。首次启动时，Loomora 会提供一次简短的使用引导。"
!define MUI_FINISHPAGE_RUN_TEXT "启动 Loomora"

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  BrandingText "Loomora · 织光成画"
  XPStyle on
!macroend

; Electron can leave the main process alive briefly while an upgrade starts.
; Close only Loomora processes, then wait until the executable is unlocked.
!macro customCheckAppRunning
  ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  Sleep 700
  nsExec::ExecToLog `%SYSTEMROOT%\\System32\\taskkill.exe /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  StrCpy $R1 0
  loomora_wait_for_exit:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      IntOp $R1 $R1 + 1
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R1 < 20
        Sleep 500
        Goto loomora_wait_for_exit
      ${endIf}
    ${endIf}
!macroend
