; RemindAni installer customisations, included by electron-builder before its page templates.

!define MUI_FINISHPAGE_RUN_TEXT "Launch RemindAni"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Set up RemindAni"
  !define MUI_WELCOMEPAGE_TEXT "RemindAni puts a reminder card on screen when it's time and keeps it there until you answer.$\r$\n$\r$\nBy default it installs for your account only and does not need administrator rights. You can choose to install it for everyone on the next page.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Sign-in entry written by app.setLoginItemSettings (value name = AppUserModelId).
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.remindani.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.remindani.app"

    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove your reminders, settings and imported sounds?$\r$\n$\r$\nChoose No to keep them for a later reinstall." /SD IDNO IDNO remindaniKeepData
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      RMDir /r "$APPDATA\RemindAni"
      RMDir /r "$APPDATA\remindani"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    remindaniKeepData:
  ${endIf}
!macroend
