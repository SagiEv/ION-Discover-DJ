# DiscoverTube DJ - System Architecture

DiscoverTube DJ is built as a cross-platform desktop application using Electron, React, Vite, and the Web Audio API. 

## Process Model
The application adheres to Electron's standard process model, enforcing a strict separation between the backend (Node.js/OS access) and the frontend (UI/Audio).

### Main Process (`electron/main.js`)
The Main Process handles all native OS interactions and heavy lifting:
- **Window Management**: Instantiates the borderless, transparent `BrowserWindow`.
- **System APIs**: Uses `fs`, `os`, and `path` to interact with the user's filesystem.
- **YouTube Pipeline**: Uses `yt-search` and `youtube-dl-exec` to scrape and download media securely outside of the browser context.
- **AI Stems Engine**: Interfaces with the Demucs model using a dedicated background worker (`demucsWorker.mjs`) to perform heavy audio source separation natively. The worker automatically terminates after 60 seconds of inactivity to aggressively save memory.
- **Protocol Registration**: Creates a custom `localfile://` protocol to securely stream downloaded and local audio files into the Renderer process, bypassing standard CORS and file access restrictions.

### Preload Script (`electron/preload.js`)
Acting as the bridge between Main and Renderer, the preload script exposes a minimal, safe API to the frontend via `contextBridge`.
- Exposes `window.electronAPI.searchYoutube()`.
- Exposes `window.electronAPI.downloadAudio()`.
- Exposes APIs for interacting with settings (`getDefaultPaths`, `selectDirectory`) and AI stem separation (`separateStems`, `checkStems`).
- Handles reading and writing of `midi-mapping.json` directly to the `AppData/Roaming` directory.

### Renderer Process (`src/`)
The frontend is a React application served by Vite during development. 
- **Component Tree**: Organized by logical hardware representations (`DeckPanel`, `JogWheel`, `ControllerSurface`, `TrackBrowser`) and dynamic modals (`BrowseModal`, `SettingsModal`, `StemQueueModal`, `LyricsView`, `FXPanel`).
- **State Management**: Built entirely on `zustand` (`src/store/appStore.js`). The store acts as the single source of truth, synchronizing UI visuals, MIDI LEDs, and audio engine logic.

## State Flow
When a user physically moves a knob on their hardware controller:
1. The Main process (`main.js`) receives raw MIDI events from the OS via `easymidi` and sends them over IPC to the frontend (`MidiLayer.jsx`).
2. The incoming message is mapped to a software action (e.g., `treble_A`).
3. `DJController.js` processes the action and instructs the Audio Engine (e.g., updating a BiquadFilter node).
4. `DJController.js` updates the `zustand` store with the new value.
5. The React components (like the on-screen EQ knobs) automatically re-render to reflect the new state.
