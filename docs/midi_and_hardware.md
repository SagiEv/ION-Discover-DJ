# MIDI & Hardware Integration

DiscoverTube DJ is designed to work seamlessly with USB MIDI DJ controllers, specifically optimized for the ION Discover DJ.

## MIDI Mapping System (`MidiLayer.jsx` & `MidiController.js`)
Instead of hardcoding MIDI channels and CC values, the app features a dynamic "MIDI Learn" overlay.
- When MIDI Learn is active, the app listens to the next raw MIDI byte stream.
- It records the message type (Control Change or Note On), the Channel, and the Data byte.
- This mapping is immediately saved to the user's OS directory (`C:\Users\<user>\AppData\Roaming\discovertubedj\midi-mapping.json`) via Electron IPC.

## Jog Wheel Math & Decoding
Hardware jog wheels do not send absolute positions; they send relative "ticks" as they are spun. The app decodes these ticks using standard MIDI two's complement encoding.

### The Delta Calculation
When the jog wheel is moved, a value between 0 and 127 is emitted.
```javascript
// Example from DJController.js
let delta = midiValue > 64 ? midiValue - 128 : midiValue
```
- **Forward Rotation (Clockwise):** The controller sends values like `1`, `2`, `3` depending on speed. The delta evaluates to positive integers (`+1`, `+2`).
- **Backward Rotation (Counter-Clockwise):** The controller sends values starting from the top, like `127`, `126`, `125`. The math (`127 - 128 = -1`) converts this into negative deltas (`-1`, `-2`).

These deltas are then multiplied by sensitivities depending on the active mode (Pitch Bend vs Scratch Mode) and applied directly to the audio engine.

## LED Feedback Synchronization
To ensure the hardware controller accurately reflects the software state (e.g., the Play/Pause button lights up when music is playing), the app proactively blasts MIDI `noteon` and `noteoff` messages back to the controller.

In `MidiLayer.jsx`, a React `useEffect` hook monitors the `zustand` store:
- If `deckA.isPlaying` becomes true, the app looks up the user's mapped MIDI note for `play_pause_A`.
- It transmits a `noteon` message with maximum velocity to the controller on that channel, immediately lighting up the physical button on the user's desk.
