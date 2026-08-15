# YouTube Integration System

DiscoverTube DJ completely removes the need to manually download MP3s by integrating a robust, safe YouTube fetching pipeline directly into the application.

## The Search Pipeline
When a user types a query into the `TrackBrowser` component, the following sequence occurs:
1. The Renderer calls `window.electronAPI.searchYoutube(query)`.
2. The IPC bridge routes this to the Main process (`electron/main.js`).
3. The Main process utilizes the `yt-search` node module to scrape YouTube.
4. The payload (Video Title, Channel, Duration, VideoID, Thumbnail) is returned to the UI.

## The Download & Extraction Pipeline
Once a user clicks a result to load it onto a deck, the download pipeline begins:
1. The Main process receives the `videoId` and generates a full YouTube URL.
2. It invokes `youtube-dl-exec` natively. 
3. The format flag `bestaudio[ext=webm]` is used to download the highest quality native Opus stream, avoiding the need for external MP3 encoders, and saves it directly to your configured Songs directory.

## Secure Local Streaming
Because standard Chromium security protocols block a web application from accessing arbitrary paths on the user's hard drive (like `C:/Users/Temp/...`), the application cannot simply set an `<audio src="C:/...">`.

To bypass this safely:
1. The Main process registers a custom protocol: `protocol.registerFileProtocol('localfile')`.
2. When the Renderer requests `localfile://C:/Users/Temp/song.mp3`, the Main process intercepts the request and serves the binary data natively.
3. The Renderer then uses `fetch()` to grab the ArrayBuffer and passes it to the `AudioContext.decodeAudioData()` engine for immediate playback.
