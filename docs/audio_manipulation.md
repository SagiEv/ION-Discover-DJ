# Audio Manipulation & DJ Mechanics

DiscoverTube DJ relies entirely on the Web Audio API to manipulate decoded audio data in real-time, providing zero-latency scratching and pitching.

## The Reverse Audio Buffer Trick
The standard HTML5 `<audio>` element and the Web Audio API `AudioBufferSourceNode` do not natively support negative playback rates (reverse playback). 

To achieve true vinyl reverse scratching, we implemented a custom buffer inversion algorithm in `Deck.js`:
1. When a track is loaded, the engine immediately processes a cloned version of the raw `AudioBuffer`.
2. It iterates through every channel and uses `.reverse()` on the Float32 arrays.
3. This creates a permanently backward, exact replica of the track in memory (`this._getReversedBuffer()`).

When the user physically pulls the jog wheel backward:
1. `toggleReverse()` is called.
2. The current `AudioBufferSourceNode` is instantly halted.
3. A brand new node is instantiated on the fly, swapping the buffer from the forward version to the reversed version.
4. The playhead position is mathematically inverted (`duration - currentPos`) to seamlessly pick up at the exact millisecond the user reversed direction.

## True Scratch vs Pitch Bend
The app distinctively handles continuous physical scratching vs slight tempo bending based on the user's hardware inputs.

- **Search/Pitch Bend Mode:** 
  If the scratch LED is off, spinning the jog wheel modifies the master tempo by a fraction of a percent. The code applies a small multiplier (e.g., `rate = 1.0 + (delta * 0.03)`). When the wheel stops, the track resumes normal speed.
- **True Scratch Mode:** 
  If the scratch LED is on, the hardware dictates the *absolute speed* of the audio. If the user spins the wheel rapidly, the playback rate dynamically ramps up to 3.0x speed (`deck.setScratchRate`). If the user rotates it backward, the reverse buffer trick activates instantly.

## Physical vs Timeline Visual Rotation
To emulate a true turntable, the UI jog wheels must accurately reflect the physical rotation of the hardware wheels, *not* just the progress of the audio track.

To solve this, we decoupled the UI rotation from the audio timeline. 
The app maintains a `visualAngle` property for each deck:
- **During Normal Playback:** `Deck.js` calculates a fake 33⅓ RPM motor speed (200 degrees/second) and automatically increments `visualAngle`.
- **During Scratching:** When the jog wheel is manipulated, `DJController.js` instantly overrides the motor, adding the raw MIDI hardware delta directly to `visualAngle`.
- **Result:** The UI wheel effortlessly transitions between acting like a motorized turntable and physically tracking the user's hand movements 1:1.
