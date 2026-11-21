!macro NSIS_HOOK_PREINSTALL
  ; Cierra una instalacion anterior antes de sobrescribir sus archivos.
  ; Sin esto, una App en ejecucion (o un packwiz huerfano) deja
  ; resources\packwiz.exe bloqueado y NSIS muestra:
  ;   "Error opening file for writing: ...\resources\packwiz.exe"
  ExecWait '"$SYSDIR\taskkill.exe" /F /IM Packwright.exe /T'

  ; El proceso hijo puede sobrevivir a la app (app cerrada a la fuerza).
  ; Solo matamos el packwiz de esta instalacion, no uno ajeno.
  ExecWait 'powershell.exe -NoProfile -NonInteractive -Command "Get-Process packwiz -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like $\'$LOCALAPPDATA\Packwright\resources\*$\' } | Stop-Process -Force"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Sin acciones antes de desinstalar los archivos de la aplicacion.
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Eliminar TODOS los datos de Packwright del perfil del usuario.
  ; Se pide confirmacion porque incluye modpacks y servidores.
  SetShellVarContext current
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "Packwright: $\r$\n$\r$\nA??Eliminar tambien todos tus datos (configuracion, cache, modpacks y servidores)?$\r$\n$\r$\nEsta accion no se puede deshacer." \
    IDNO packwright_keep_data

  RMDir /r "$APPDATA\packwright"
  RMDir /r "$LOCALAPPDATA\packwright"
  RMDir /r "$DOCUMENTS\Packwright"
  RMDir /r "$LOCALAPPDATA\Programs\packwiz"

  packwright_keep_data:
!macroend
