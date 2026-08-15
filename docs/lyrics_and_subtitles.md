# Synced Lyrics & Subtitles

DiscoverTube DJ features a dynamic `LyricsView` component that provides real-time, karaoke-style subtitles for your tracks.

## How It Works
When a track with lyric data is loaded into a deck, the `LyricsView` component parses the data, which includes:
- **Start Time:** When the lyric segment begins.
- **Duration:** How long the segment lasts.
- **Text:** The actual lyric text.

## UI Synchronization
The visual synchronization is handled entirely within the React frontend:
1. The `LyricsView` continuously checks the deck's current playback `position` against the `start` and `duration` of each lyric segment.
2. The active lyric line is dynamically highlighted with a specific CSS class (`lyrics-line--active`), while passed lines are styled accordingly (`lyrics-line--passed`).
3. The container automatically scrolls to ensure the active lyric line is always centered on the screen, providing a smooth, distraction-free experience.
