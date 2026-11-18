import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// Types duplicated from types.ts/videoExporter.ts since importing in workers can be tricky without right config
// We'll define necessary local types.

interface WorkerMessage {
    type: 'START';
    data: {
        images: { url: string; text: string; duration?: number }[];
        audioChannels: Float32Array[];
        audioSampleRate: number;
        audioDuration: number;
        stitchedAudio: { durations: number[]; imageIndices?: number[] } | null;
        width: number;
        height: number;
        fps: number;
        bitrate: number;
        audioBitrate: number;
        imageFit: 'cover' | 'contain' | 'blur' | 'fill';
        imageScale: number;
        subtitleConfig?: any;
    };
}

interface Silence {
    start: number; // seconds
    end: number;   // seconds
}

// Helper to detect silences (Same logic as before, but adapted for raw arrays)
function detectSilencesRaw(
    channelData: Float32Array,
    sampleRate: number,
    threshold = 0.015,
    minDuration = 0.25
): Silence[] {
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms
    const silences: Silence[] = [];

    let silenceStart: number | null = null;

    for (let i = 0; i < channelData.length; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize && i + j < channelData.length; j++) {
            sum += channelData[i + j] ** 2;
        }
        const rms = Math.sqrt(sum / windowSize);
        const time = i / sampleRate;

        if (rms < threshold) {
            if (silenceStart === null) silenceStart = time;
        } else {
            if (silenceStart !== null && time - silenceStart >= minDuration) {
                silences.push({ start: silenceStart, end: time });
            }
            silenceStart = null;
        }
    }

    return silences;
}

function buildSegmentsFromSilences(
    silences: Silence[],
    duration: number,
    fps: number,
    imageCount: number
) {
    if (silences.length === 0) {
        const totalFrames = Math.ceil(duration * fps);
        const framesPerImage = totalFrames / imageCount;
        return Array.from({ length: imageCount }, (_, i) => ({
            startFrame: Math.floor(i * framesPerImage),
            endFrame: Math.floor((i + 1) * framesPerImage),
            imgIndex: i
        }));
    }

    const cutPoints = [0, ...silences.map(s => s.end), duration];
    const segments = [];
    let imgIndex = 0;

    for (let i = 0; i < cutPoints.length - 1 && imgIndex < imageCount; i++) {
        segments.push({
            startFrame: Math.floor(cutPoints[i] * fps),
            endFrame: Math.floor(cutPoints[i + 1] * fps),
            imgIndex
        });
        imgIndex++;
    }
    return segments;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type !== 'START') return;

    const {
        images,
        audioChannels,
        audioSampleRate,
        audioDuration,
        stitchedAudio,
        width,
        height,
        fps,
        bitrate,
        audioBitrate,
        imageFit,
        imageScale,
        subtitleConfig
    } = e.data.data;

    try {
        postMessage({ type: 'STATUS', text: 'Iniciando Worker...' });

        // 1. Setup Muxer
        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width,
                height
            },
            audio: {
                codec: 'aac',
                sampleRate: audioSampleRate,
                numberOfChannels: audioChannels.length
            },
            fastStart: 'in-memory'
        });

        // 2. Setup Encoders
        let encoderError: Error | null = null;
        const defaultFrameDuration = Math.round(1_000_000 / fps);

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                const duration = (chunk.duration !== null && chunk.duration !== undefined && Number.isFinite(chunk.duration) && chunk.duration > 0)
                    ? chunk.duration
                    : defaultFrameDuration;

                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
            },
            error: (e) => {
                console.error("Worker VideoEncoder Error", e);
                encoderError = e;
            }
        });

        videoEncoder.configure({
            codec: 'avc1.4d002a', // Main Profile level 4.2
            width,
            height,
            bitrate: bitrate || 4_000_000,
            framerate: fps
        });

        const audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
                const duration = (chunk.duration !== null && chunk.duration !== undefined && Number.isFinite(chunk.duration) && chunk.duration >= 0)
                    ? chunk.duration
                    : 0;

                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
            },
            error: (e) => {
                console.error("Worker AudioEncoder Error", e);
                encoderError = e;
            }
        });

        audioEncoder.configure({
            codec: 'mp4a.40.2', // AAC LC
            sampleRate: audioSampleRate,
            numberOfChannels: audioChannels.length,
            bitrate: audioBitrate || 128_000
        });

        // 3. Load Images (Bitmap)
        postMessage({ type: 'STATUS', text: 'Cargando imágenes en segundo plano...' });
        const imageBitmaps = await Promise.all(
            images.map(async (img) => {
                try {
                    const response = await fetch(img.url);
                    const blob = await response.blob();
                    return await createImageBitmap(blob);
                } catch (err) {
                    console.error("Error loading image in worker:", img.url, err);
                    // Return a placeholder or fail
                    throw new Error(`Failed to load image: ${img.url}`);
                }
            })
        );

        // 4. Calculate Timeline
        const silences = detectSilencesRaw(audioChannels[0], audioSampleRate);
        let segments: { startFrame: number, endFrame: number, imgIndex: number }[] = [];
        const totalFrames = Math.ceil(audioDuration * fps);

        if (stitchedAudio && stitchedAudio.durations.length > 0) {
            let currentFrame = 0;
            stitchedAudio.durations.forEach((dur, idx) => {
                const mappedIndex = stitchedAudio.imageIndices ? stitchedAudio.imageIndices[idx] : idx;
                if (mappedIndex >= images.length) return;
                const framesInSegment = Math.round(dur * fps);
                segments.push({
                    startFrame: currentFrame,
                    endFrame: currentFrame + framesInSegment,
                    imgIndex: mappedIndex
                });
                currentFrame += framesInSegment;
            });
            if (segments.length > 0) segments[segments.length - 1].endFrame = totalFrames;
        } else if (silences.length > 0) {
            segments = buildSegmentsFromSilences(silences, audioDuration, fps, images.length);
        } else {
            const framesPerImage = totalFrames / images.length;
            segments = Array.from({ length: images.length }, (_, i) => ({
                startFrame: Math.floor(i * framesPerImage),
                endFrame: Math.floor((i + 1) * framesPerImage),
                imgIndex: i
            }));
        }

        // 5. Draw and Encode Video
        postMessage({ type: 'STATUS', text: 'Renderizando video (Worker)...' });
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { alpha: false })!;

        // Helper to draw text since OffscreenCanvas supports it
        const drawSubtitles = (text: string, elapsed: number, segment: any, width: number, height: number, subtitleConfig: any) => {
            if (!text || !text.trim()) return;

            const segmentDuration = (segment.endFrame - segment.startFrame) / fps;
            const segmentElapsed = Math.max(0, elapsed - (segment.startFrame / fps));

            ctx.save();
            ctx.fillStyle = subtitleConfig.color;
            ctx.font = `bold ${subtitleConfig.fontSize}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (!subtitleConfig.showBackground) {
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 4;
            }

            // Word wrap & chunking logic (Simplified for worker - copied from main)
            const words = text.trim().split(/\s+/);
            const wordsPerBlock = subtitleConfig.wordsPerLine || 4;
            const chunks: string[] = [];
            for (let k = 0; k < words.length; k += wordsPerBlock) {
                chunks.push(words.slice(k, k + wordsPerBlock).join(' '));
            }

            const chunkWeights = chunks.map(c => c.length + 3);
            const totalWeight = chunkWeights.reduce((a, b) => a + b, 0) || 1;

            let chunkCtx = { idx: 0, start: 0, dur: segmentDuration };
            let accC = 0;
            for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
                const d = (chunkWeights[cIdx] / totalWeight) * segmentDuration;
                if (segmentElapsed < accC + d) {
                    chunkCtx = { idx: cIdx, start: accC, dur: d };
                    break;
                }
                accC += d;
                if (cIdx === chunks.length - 1) chunkCtx = { idx: cIdx, start: accC - d, dur: d }
            }

            const currentChunk = chunks[chunkCtx.idx] || "";
            const chunkElapsed = Math.max(0, segmentElapsed - chunkCtx.start);
            const progress = Math.min(1, chunkElapsed / (chunkCtx.dur * 0.9));
            const visibleLen = Math.floor(currentChunk.length * progress);
            const textToShow = currentChunk.substring(0, visibleLen);

            // Draw Lines
            const maxWidth = width * 0.9;
            const subWords = textToShow.split(' ');
            let line = '';
            const lines = [];
            for (let w of subWords) {
                const test = line + w + ' ';
                if (ctx.measureText(test).width > maxWidth && lines.length < 3) {
                    lines.push(line);
                    line = w + ' ';
                } else line = test;
            }
            lines.push(line);

            const lineHeight = subtitleConfig.fontSize * 1.3;
            const blockH = lines.length * lineHeight;
            let y = height - blockH - 40;
            if (subtitleConfig.position === 'center') y = (height - blockH) / 2;
            if (subtitleConfig.position === 'top') y = 60;

            if (subtitleConfig.showBackground) {
                const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect((width / 2) - (maxW / 2) - 10, y - 10, maxW + 20, blockH + 20);
                ctx.fillStyle = subtitleConfig.color;
            }

            lines.forEach((l, li) => {
                ctx.fillText(l.trim(), width / 2, y + li * lineHeight + lineHeight / 2);
            });
            ctx.restore();
        };


        for (let i = 0; i < totalFrames; i++) {
            if (encoderError) throw encoderError;

            const timestamp = (i / fps) * 1_000_000;
            const elapsed = i / fps;

            const segment = segments.find(s => i >= s.startFrame && i < s.endFrame) || segments[segments.length - 1];
            const imgParams = images[segment?.imgIndex || 0];
            const imgBitmap = imageBitmaps[segment?.imgIndex || 0];

            // Draw Image
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);

            if (imgBitmap) {
                const iw = imgBitmap.width;
                const ih = imgBitmap.height;
                const scaleFactor = imageScale / 100;
                let finalW = 0, finalH = 0;

                if (imageFit === 'fill') {
                    finalW = width * scaleFactor;
                    finalH = height * scaleFactor;
                } else if (imageFit === 'cover') {
                    const scale = Math.max(width / iw, height / ih);
                    finalW = iw * scale * scaleFactor;
                    finalH = ih * scale * scaleFactor;
                } else {
                    const scale = Math.min(width / iw, height / ih);
                    finalW = iw * scale * scaleFactor;
                    finalH = ih * scale * scaleFactor;
                }
                ctx.drawImage(imgBitmap, (width - finalW) / 2, (height - finalH) / 2, finalW, finalH);
            }

            // Subtitles
            if (subtitleConfig && subtitleConfig.enabled && imgParams) {
                drawSubtitles(imgParams.text, elapsed, segment, width, height, subtitleConfig);
            }

            const frame = new VideoFrame(canvas, { timestamp, duration: defaultFrameDuration });

            // Flow Control
            if (videoEncoder.encodeQueueSize > 50) {
                await videoEncoder.flush();
            }

            videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            if (i % 30 === 0) {
                postMessage({ type: 'PROGRESS', value: (i / totalFrames) * 80 });
            }
        }

        await videoEncoder.flush();
        videoEncoder.close();

        // 6. Encode Audio
        postMessage({ type: 'STATUS', text: 'Procesando audio (Worker)...' });

        const totalSamples = audioChannels[0].length;
        const samplesPerChunk = 44100;

        for (let offset = 0; offset < totalSamples; offset += samplesPerChunk) {
            if (encoderError) throw encoderError;

            const length = Math.min(samplesPerChunk, totalSamples - offset);
            const timestamp = (offset / audioSampleRate) * 1_000_000;

            const planarBuffer = new Float32Array(length * audioChannels.length);
            for (let c = 0; c < audioChannels.length; c++) {
                planarBuffer.set(audioChannels[c].slice(offset, offset + length), c * length);
            }

            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: audioSampleRate,
                numberOfFrames: length,
                numberOfChannels: audioChannels.length,
                timestamp,
                data: planarBuffer
            });

            audioEncoder.encode(audioData);
            audioData.close();
        }

        await audioEncoder.flush();
        audioEncoder.close();

        // 7. Finish
        postMessage({ type: 'STATUS', text: 'Finalizando...' });
        muxer.finalize();
        const { buffer } = muxer.target;

        postMessage({ type: 'DONE', blob: new Blob([buffer], { type: 'video/mp4' }) });

    } catch (error: any) {
        postMessage({ type: 'ERROR', error: error.message || String(error) });
    }
};
