// Convert AudioBuffer to WAV Blob
export function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this loop)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

    while (pos < buffer.length) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(44 + offset, sample, true); // write 16-bit sample
            offset += 2;
        }
        pos++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

export interface AudioStitchItem {
    url: string;
    duration?: number;
}

export async function stitchAudioBlobs(
    items: (string | AudioStitchItem)[]
): Promise<{ url: string, durations: number[] }> {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = 44100;
    const defaultChannels = 2;

    const audioBuffers: AudioBuffer[] = [];

    for (const item of items) {
        const url = typeof item === 'string' ? item : item.url;
        const fallbackDuration = (typeof item === 'object' && item.duration && Number.isFinite(item.duration)) 
            ? item.duration 
            : 4;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const decoded = await audioCtx.decodeAudioData(arrayBuffer);
            audioBuffers.push(decoded);
        } catch (err) {
            console.warn(`No se encontró o no se pudo decodificar audio de ${url}. Generando silencio de ${fallbackDuration}s.`);
            const silenceFrames = Math.max(1, Math.round(sampleRate * fallbackDuration));
            const silenceBuffer = audioCtx.createBuffer(defaultChannels, silenceFrames, sampleRate);
            audioBuffers.push(silenceBuffer);
        }
    }

    // Calculate total length and durations
    const durations: number[] = [];
    const totalLength = audioBuffers.reduce((acc, buf) => {
        durations.push(buf.duration);
        return acc + buf.length;
    }, 0);

    if (totalLength === 0) {
        audioCtx.close();
        return { url: '', durations: [] };
    }

    const numberOfChannels = audioBuffers[0]?.numberOfChannels || 2;
    const resultBuffer = audioCtx.createBuffer(numberOfChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of audioBuffers) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = buf.numberOfChannels > channel 
                ? buf.getChannelData(channel) 
                : buf.getChannelData(0); // fallback mono to stereo
            resultBuffer.copyToChannel(channelData, channel, offset);
        }
        offset += buf.length;
    }

    const wavBlob = audioBufferToWav(resultBuffer);
    audioCtx.close();
    return {
        url: URL.createObjectURL(wavBlob),
        durations
    };
}
