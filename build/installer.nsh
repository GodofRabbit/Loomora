; Loomora visual theme. These definitions are consumed by NSIS Modern UI
; before the assisted installer pages are created.
; Keep the regular installer pages native and light. The welcome page applies
; the Loomora dark treatment locally so the finish and progress pages do not
; carry a full-window purple background or a tinted bottom bar.
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "2A2433"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 Loomora"
!define MUI_WELCOMEPAGE_TEXT "将灵感织成画面。$\r$\n$\r$\n安装向导将帮助您完成设置。下一步可选择安装范围与位置。"
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择 Loomora 的安装位置。建议保留默认路径，也可以安装到其他磁盘。"
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "安装位置"
!define MUI_FINISHPAGE_TITLE "Loomora 已安装完成"
!define MUI_FINISHPAGE_TEXT "现在可以开始创作了。首次启动时，Loomora 会提供一次简短的使用引导。"
!define MUI_FINISHPAGE_RUN_TEXT "启动 Loomora"

LangString deleteUserDataQuestion 2052 "是否同时删除 Loomora 保存的本地作品、历史记录和设置？$\r$\n选择“否”将保留这些数据，之后重新安装仍可使用。"

; Keep user data by default, but make the choice explicit during an assisted
; uninstall. This runs after the install scope is selected, so the same
; per-user/per-machine context is used as the normal electron-builder cleanup.
!macro customUnInit
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "$(deleteUserDataQuestion)" IDYES loomora_delete_user_data_done
    Goto loomora_delete_user_data_done

    loomora_delete_user_data_done:
    ${If} $0 == ${IDYES}
      Call un.checkAppRunning
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    ${endif}
  ${endif}
!macroend

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW loomoraWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
  !undef MUI_PAGE_CUSTOMFUNCTION_SHOW
!macroend

Function loomoraWelcomeShow
  ; Only the welcome page is branded dark; all other pages retain the native
  ; light body and footer supplied by Modern UI.
  SetCtlColors $mui.WelcomePage "" "0B0818"
  SetCtlColors $mui.WelcomePage.Title "EEE8FA" "0B0818"
  SetCtlColors $mui.WelcomePage.Text "EEE8FA" "0B0818"
FunctionEnd

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
