; VoiceBridge Windows Installer
; NSIS 3.x script
; Bundles VB-Audio Virtual Cable + the VoiceBridge app

!define APP_NAME     "VoiceBridge"
!define APP_VERSION  "0.1.0"
!define APP_EXE      "VoiceBridge.exe"
!define PUBLISHER    "VoiceBridge Ltd"
!define WEBSITE      "https://voicebridge.app"
!define INSTALL_DIR  "$PROGRAMFILES64\${APP_NAME}"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

; ─── General ─────────────────────────────────────────────────────────────────
Name             "${APP_NAME} ${APP_VERSION}"
OutFile          "VoiceBridgeSetup-${APP_VERSION}.exe"
InstallDir       "${INSTALL_DIR}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor    /SOLID lzma
Unicode          true

; ─── UI ──────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON    "..\..\app\assets\icon.ico"
!define MUI_UNICON  "..\..\app\assets\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "installer-header.bmp"
!define MUI_BGCOLOR "0F172A"
!define MUI_TEXTCOLOR "FFFFFF"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Turkish"

; ─── Install sections ────────────────────────────────────────────────────────

Section "VoiceBridge App" SEC_APP
    SectionIn RO  ; required

    SetOutPath "$INSTDIR"
    File /r "..\..\app\dist\win-unpacked\*.*"

    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortcut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    CreateShortcut  "$DESKTOP\${APP_NAME}.lnk"                "$INSTDIR\${APP_EXE}"

    ; Registry — uninstaller
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayName"      "${APP_NAME}"
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayVersion"   "${APP_VERSION}"
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "Publisher"        "${PUBLISHER}"
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "URLInfoAbout"     "${WEBSITE}"
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "InstallLocation"  "$INSTDIR"
    WriteRegStr   HKLM "${UNINSTALL_KEY}" "UninstallString"  "$INSTDIR\Uninstall.exe"
    WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify"         1
    WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair"         1

    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "VB-Audio Virtual Cable (virtual microphone)" SEC_VBCABLE
    ; VB-Audio VBCABLE_Driver_Pack43 — free for personal/commercial use
    ; Download at: https://vb-audio.com/Cable/
    ; Include VBCABLE_Setup_x64.exe in drivers/windows/
    SetOutPath "$TEMP\vbcable"
    File "vbcable\VBCABLE_Setup_x64.exe"

    DetailPrint "Installing VB-Audio Virtual Cable (requires admin)…"
    ExecWait '"$TEMP\vbcable\VBCABLE_Setup_x64.exe" /S' $0
    ${If} $0 == 0
        DetailPrint "VB-Audio Virtual Cable installed successfully."
    ${Else}
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "VB-Audio install returned code $0.$\nYou can install it manually from https://vb-audio.com/Cable/"
    ${EndIf}
SectionEnd

; ─── Uninstall ────────────────────────────────────────────────────────────────
Section "Uninstall"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir  /r "$INSTDIR"
    Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
    RMDir  "$SMPROGRAMS\${APP_NAME}"
    Delete "$DESKTOP\${APP_NAME}.lnk"
    DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
