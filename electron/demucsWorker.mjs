import fs from 'node:fs';
import path from 'node:path';
import { separateTracks } from 'demucs/dist/apply.js';
import { ONNXHTDemucs } from 'demucs/dist/onnx-htdemucs.js';
import { samplesToWav, wavToSamples } from 'demucs/dist/wav-utils.js';

let model = null;

async function ensureModel() {
    if (!model) {
        console.log('Loading model...');
        let weightsPath = path.join(import.meta.dirname, '../node_modules/demucs/htdemucs.onnx');
        weightsPath = weightsPath.replace(/app\.asar/g, 'app.asar.unpacked');
        model = await ONNXHTDemucs.init(weightsPath);
    }
    return model;
}

// Support both utilityProcess and child_process.fork
const port = process.parentPort || process;
const send = (msg) => {
    if (process.parentPort) process.parentPort.postMessage(msg);
    else process.send(msg);
};

port.on('message', async (e) => {
    const msg = e.data || e;
    if (msg.type === 'process') {
        const { inputPath, outputDir, trackId, overlap = 0.25 } = msg;
        try {
            await ensureModel();
            console.log('Reading and processing audio...');
            const inputBuffer = new Uint8Array(fs.readFileSync(inputPath));
            const rawAudio = wavToSamples(inputBuffer);
            
            function progress(step, total) {
                send({ type: 'progress', trackId, progress: `${step}/${total}` });
            }
            
            const tracks = await separateTracks(model, rawAudio, progress, overlap);
            
            console.log('Writing output files...');
            fs.mkdirSync(outputDir, { recursive: true });
            for (const [trackName, samples] of Object.entries(tracks)) {
                let wavBuffer = samplesToWav(samples.channelData, samples.sampleRate);
                let outputPath = path.join(outputDir, `${trackName}.wav`);
                fs.writeFileSync(outputPath, wavBuffer);
            }
            send({ type: 'done', trackId, outputDir });
        } catch (err) {
            send({ type: 'error', trackId, error: err.message || String(err) });
        }
    }
});
