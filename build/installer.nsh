!include nsDialogs.nsh

ShowInstDetails show
Var SongsDir
Var StemsDir
Var SongsDirHandle
Var StemsDirHandle
Var SongsBrowseBtn
Var StemsBrowseBtn

; Add a custom page before the installation progress page
Page custom CustomPathsPage CustomPathsLeave

Function CustomPathsPage
  ; Custom header text omitted to fix macro error

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "Select Songs Directory:"
  Pop $0

  StrCpy $SongsDir "$APPDATA\discovertubedj\songs"
  ${NSD_CreateDirRequest} 0 15u 75% 12u "$SongsDir"
  Pop $SongsDirHandle
  ${NSD_CreateBrowseButton} 77% 14u 23% 14u "Browse..."
  Pop $SongsBrowseBtn
  ${NSD_OnClick} $SongsBrowseBtn OnSongsBrowse

  ${NSD_CreateLabel} 0 35u 100% 12u "Select Stems Directory:"
  Pop $0

  StrCpy $StemsDir "$APPDATA\discovertubedj\stems"
  ${NSD_CreateDirRequest} 0 50u 75% 12u "$StemsDir"
  Pop $StemsDirHandle
  ${NSD_CreateBrowseButton} 77% 49u 23% 14u "Browse..."
  Pop $StemsBrowseBtn
  ${NSD_OnClick} $StemsBrowseBtn OnStemsBrowse

  nsDialogs::Show
FunctionEnd

Function OnSongsBrowse
  ${NSD_GetText} $SongsDirHandle $0
  nsDialogs::SelectFolderDialog "Select Songs Directory" $0
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $SongsDirHandle $0
  ${EndIf}
FunctionEnd

Function OnStemsBrowse
  ${NSD_GetText} $StemsDirHandle $0
  nsDialogs::SelectFolderDialog "Select Stems Directory" $0
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $StemsDirHandle $0
  ${EndIf}
FunctionEnd

Function CustomPathsLeave
  ${NSD_GetText} $SongsDirHandle $SongsDir
  ${NSD_GetText} $StemsDirHandle $StemsDir
FunctionEnd

!macro customGUIInit
  SetDetailsView show
!macroend

!macro customInstall
  SetDetailsView show
  ; Write chosen directories to registry
  WriteRegStr HKCU "Software\discovertubedj" "SongsPath" "$SongsDir"
  WriteRegStr HKCU "Software\discovertubedj" "StemsPath" "$StemsDir"
!macroend
