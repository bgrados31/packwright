!macro NSIS_HOOK_PREUNINSTALL
  ; Sin acciones antes de desinstalar los archivos de la aplicacion.
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Eliminar TODOS los datos de Packwright del perfil del usuario.
  ; Se pide confirmacion porque incluye modpacks y servidores.
  SetShellVarContext current
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "Packwright: $\r$\n$\r$\n¿Eliminar tambien todos tus datos (configuracion, cache, modpacks y servidores)?$\r$\n$\r$\nEsta accion no se puede deshacer." \
    IDNO packwright_keep_data

  RMDir /r "$APPDATA\packwright"
  RMDir /r "$LOCALAPPDATA\packwright"
  RMDir /r "$DOCUMENTS\Packwright"
  RMDir /r "$LOCALAPPDATA\Programs\packwiz"

  packwright_keep_data:
!macroend
