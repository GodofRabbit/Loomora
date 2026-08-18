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

!ifdef BUILD_UNINSTALLER
  Var loomoraDeleteUserData
  Var loomoraDeleteUserDataCheckbox
!endif

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW loomoraWelcomeShow
  !insertmacro MUI_PAGE_WELCOME

  Function loomoraWelcomeShow
    ; Only the welcome page is branded dark; all other pages retain the native
    ; light body and footer supplied by Modern UI.
    SetCtlColors $mui.WelcomePage "" "0B0818"
    SetCtlColors $mui.WelcomePage.Title "EEE8FA" "0B0818"
    SetCtlColors $mui.WelcomePage.Text "EEE8FA" "0B0818"
  FunctionEnd
!macroend

!macro customUnWelcomePage
  ; Modern UI reuses the generic welcome variables for uninstall pages.
  !undef MUI_WELCOMEPAGE_TITLE
  !undef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TITLE "欢迎使用 Loomora 卸载向导"
  !define MUI_WELCOMEPAGE_TEXT "本向导将帮助您从电脑中卸载 Loomora。$\r$\n$\r$\n卸载前请先关闭正在运行的 Loomora。"
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.loomoraDataPageCreate un.loomoraDataPageLeave

  Function un.loomoraDataPageCreate
    !insertmacro MUI_HEADER_TEXT "本地数据" "选择卸载后要保留的内容"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0u 4u 300u 32u "默认会保留您的本地数据，重新安装 Loomora 后仍可继续使用。"
    Pop $1

    ${NSD_CreateCheckbox} 0u 48u 300u 18u "同时删除本地作品、历史记录和设置"
    Pop $loomoraDeleteUserDataCheckbox
    ${If} $loomoraDeleteUserData == ${BST_CHECKED}
      ${NSD_Check} $loomoraDeleteUserDataCheckbox
    ${Else}
      ${NSD_Uncheck} $loomoraDeleteUserDataCheckbox
    ${EndIf}

    ${NSD_CreateLabel} 16u 72u 284u 38u "勾选后将永久删除默认作品库及应用数据，此操作无法撤销。自定义到其他位置的作品文件不会被删除。"
    Pop $1

    nsDialogs::Show
  FunctionEnd

  Function un.loomoraDataPageLeave
    ${NSD_GetState} $loomoraDeleteUserDataCheckbox $loomoraDeleteUserData
    ${If} $loomoraDeleteUserData == ${BST_CHECKED}
      Return
    ${EndIf}

    ; Older Windows builds stored Gallery beside the executable. Preserve it
    ; in Electron's user-data directory before NSIS removes $INSTDIR.
    IfFileExists "$INSTDIR\Gallery\*.*" 0 loomora_preserve_done
    CreateDirectory "$APPDATA\${APP_FILENAME}\Gallery"
    nsExec::ExecToStack '"$SYSDIR\robocopy.exe" "$INSTDIR\Gallery" "$APPDATA\${APP_FILENAME}\Gallery" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP'
    Pop $0
    Pop $1
    ${If} $0 == "error"
      Goto loomora_preserve_failed
    ${EndIf}
    IntCmp $0 8 loomora_preserve_failed loomora_preserve_done loomora_preserve_failed

    loomora_preserve_failed:
      MessageBox MB_OK|MB_ICONSTOP "无法安全保留安装目录中的作品库。请确认磁盘空间和文件权限后重试卸载。"
      Abort

    loomora_preserve_done:
  FunctionEnd
!macroend

; electron-builder runs this after its own optional --delete-app-data cleanup.
; The assisted uninstaller uses the checkbox above, while silent upgrades keep
; the variable empty and therefore always preserve user data.
!macro customUnInstall
  ${If} $loomoraDeleteUserData == ${BST_CHECKED}
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
  ${EndIf}
!macroend

; electron-builder inserts this hook immediately before the uninstall finish
; page, which lets that page receive uninstall-specific copy as well.
!macro customUninstallPage
  !undef MUI_FINISHPAGE_TITLE
  !undef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TITLE "Loomora 已成功卸载"
  !define MUI_FINISHPAGE_TEXT "Loomora 已从您的电脑中移除。"
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
