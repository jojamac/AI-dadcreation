import { AdImage } from '../types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import VideoWorker from './video.worker.ts?worker'; // Vite worker import syntax

/* =======================
   NUEVAS UTILIDADES AUDIO
======================= */

interface Silence {
    start: number; // seconds
    end: number;   // seconds
}

export class SimpleAudioBuffer {
    numberOfChannels: number;
    sampleRate: number;
    length: number;
    duration: number;
    private channelData: Float32Array[];

    constructor(options: { length: number; numberOfChannels: number; sampleRate: number; data?: Float32Array[] }) {
        this.length = options.length;
        this.numberOfChannels = options.numberOfChannels;
        this.sampleRate = options.sampleRate;
        this.duration = this.length / this.sampleRate;
        this.channelData = options.data || [];
        if (this.channelData.length === 0) {
            for (let i = 0; i < this.numberOfChannels; i++) {
                this.channelData.push(new Float32Array(this.length));
            }
        }
    }

    getChannelData(channel: number): Float32Array {
        if (channel >= this.numberOfChannels) throw new Error("Channel index out of bounds");
        return this.channelData[channel];
    }
}

function detectSilences(
    audioBuffer: AudioBuffer | SimpleAudioBuffer,
    threshold = 0.015,
    minDuration = 0.25
): Silence[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
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
        // fallback: reparto lineal
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


/* =======================
   EXPORTER
======================= */

export interface SubtitleConfig {
    enabled: boolean;
    fontSize: number;
    color: string;
    position: 'bottom' | 'center' | 'top';
    showBackground?: boolean;
    wordsPerLine?: number;
}

interface ExportOptions {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    audioBitrate: number;
    onProgress?: (progress: number) => void;
    onStatus?: (text: string) => void;
    imageFit: 'cover' | 'contain' | 'blur' | 'fill';
    imageScale: number;
    transitions: Record<string, string>;
    selectedTransition: string;
    subtitleConfig?: SubtitleConfig;
}

/* 🔥 MEDIA RECORDER FALLBACK (Kept for reference, but unlikely to be used) 🔥 */
export const exportVideoViaMediaRecorder = async (
    images: AdImage[],
    audioBuffer: AudioBuffer | SimpleAudioBuffer,
    stitchedAudio: { url: string; durations: number[]; imageIndices?: number[] } | null,
    options: ExportOptions
): Promise<Blob> => {
    // ... Implementación vieja omitida o dejada si se requiere fallback
    // Por brevedad, y dado que el usuario quiere Muxer, lanzamos error o devolvemos dummy si alguien la llama.
    // O mejor, redirigimos a Muxer.
    return exportVideoViaMuxer(images, audioBuffer, stitchedAudio, options);
};

export const renderVideoFromPCM = async (
    images: AdImage[],
    audioPCM: Float32Array,
    audioMeta: {
        sampleRate: number;
        channels: number;
        length: number;
    },
    stitchedAudio: { url: string; durations: number[] } | null,
    options: ExportOptions
): Promise<ArrayBuffer> => {
    return new ArrayBuffer(0);
}

/* =======================
   EXPORTER V2 (WebCodecs + Glue Worker)
   Fixes Sync & Mobile Support & Background Tabs
======================= */

async function exportSequenceWithVideos(
    images: AdImage[],
    audioBuffer: AudioBuffer | SimpleAudioBuffer,
    stitchedAudio: { url: string; durations: number[]; imageIndices?: number[] } | null,
    options: ExportOptions
): Promise<Blob> {
    const { onProgress, onStatus, width, height, fps, bitrate, audioBitrate, imageFit, imageScale, selectedTransition, subtitleConfig } = options;

    onStatus?.("Preparando clips de video y escenas...");
    onProgress?.(5);

    // 1. Cargar elementos multimedia en memoria
    const loadedMedia = await Promise.all(
        images.map(async (img) => {
            if (img.mediaType === 'video') {
                const video = document.createElement('video');
                video.src = img.url;
                video.muted = true;
                video.preload = 'auto';
                video.playsInline = true;
                await new Promise<void>((resolve) => {
                    if (video.readyState >= 2) resolve();
                    else {
                        video.onloadeddata = () => resolve();
                        video.onerror = () => resolve();
                    }
                });
                return {
                    type: 'video' as const,
                    element: video,
                    width: video.videoWidth || width,
                    height: video.videoHeight || height,
                    duration: img.duration || video.duration || 4,
                    text: img.text
                };
            } else {
                const imageEl = new Image();
                imageEl.src = img.url;
                await new Promise<void>((resolve) => {
                    if (imageEl.complete) resolve();
                    else {
                        imageEl.onload = () => resolve();
                        imageEl.onerror = () => resolve();
                    }
                });
                return {
                    type: 'image' as const,
                    element: imageEl,
                    width: imageEl.naturalWidth || width,
                    height: imageEl.naturalHeight || height,
                    duration: img.duration || 4,
                    text: img.text
                };
            }
        })
    );

    // 2. Definir duraciones de cada segmento
    const segments: { index: number; duration: number; startSec: number; endSec: number }[] = [];
    let currentStart = 0;

    for (let i = 0; i < loadedMedia.length; i++) {
        let dur = loadedMedia[i].duration;
        if (stitchedAudio && stitchedAudio.durations && stitchedAudio.durations[i]) {
            dur = stitchedAudio.durations[i];
        }
        segments.push({
            index: i,
            duration: dur,
            startSec: currentStart,
            endSec: currentStart + dur
        });
        currentStart += dur;
    }

    const totalDuration = currentStart;
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const defaultFrameDuration = Math.round(1_000_000 / fps);

    // 3. Configurar Muxer
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', sampleRate: audioBuffer.sampleRate, numberOfChannels: audioBuffer.numberOfChannels },
        fastStart: 'in-memory'
    });

    let encoderError: Error | null = null;
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
            console.error("VideoEncoder Error in Sequence:", e);
            encoderError = e;
        }
    });

    videoEncoder.configure({
        codec: 'avc1.4d002a',
        width,
        height,
        bitrate: bitrate || 6_000_000,
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
            console.error("AudioEncoder Error in Sequence:", e);
            encoderError = e;
        }
    });

    audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        bitrate: audioBitrate || 128_000
    });

    // 4. Canvas para composición
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    onStatus?.("Renderizando y uniendo secuencias de video...");

    // Helper para dibujar con ajuste
    const drawMedia = (media: HTMLVideoElement | HTMLImageElement, mw: number, mh: number, alpha = 1.0) => {
        ctx.save();
        ctx.globalAlpha = alpha;

        const scaleFactor = imageScale / 100;
        let finalW = width * scaleFactor;
        let finalH = height * scaleFactor;

        if (imageFit === 'cover') {
            const s = Math.max(width / mw, height / mh) * scaleFactor;
            finalW = mw * s;
            finalH = mh * s;
        } else if (imageFit === 'contain') {
            const s = Math.min(width / mw, height / mh) * scaleFactor;
            finalW = mw * s;
            finalH = mh * s;
        } else if (imageFit === 'blur') {
            const sCover = Math.max(width / mw, height / mh);
            ctx.save();
            ctx.filter = 'blur(30px) brightness(0.6)';
            ctx.drawImage(media, (width - mw * sCover) / 2, (height - mh * sCover) / 2, mw * sCover, mh * sCover);
            ctx.restore();
            const s = Math.min(width / mw, height / mh) * scaleFactor;
            finalW = mw * s;
            finalH = mh * s;
        }

        ctx.drawImage(media, (width - finalW) / 2, (height - finalH) / 2, finalW, finalH);
        ctx.restore();
    };

    // Helper para buscar fotograma de video de forma segura y fiable
    const seekVideo = (v: HTMLVideoElement, targetTime: number): Promise<void> => {
        return new Promise((resolve) => {
            const vDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 10;
            const clampedTarget = Math.max(0, Math.min(targetTime, vDuration - 0.04));

            if (Math.abs(v.currentTime - clampedTarget) < 0.015 && !v.seeking) {
                resolve();
                return;
            }

            let resolved = false;
            const done = () => {
                if (!resolved) {
                    resolved = true;
                    v.removeEventListener('seeked', onSeeked);
                    v.removeEventListener('error', onError);
                    resolve();
                }
            };

            const onSeeked = () => done();
            const onError = () => done();

            v.addEventListener('seeked', onSeeked, { once: true });
            v.addEventListener('error', onError, { once: true });

            setTimeout(done, 250);

            try {
                v.currentTime = clampedTarget;
            } catch {
                done();
            }
        });
    };

    // 5. Renderizar cuadros
    const transitionFrames = selectedTransition && selectedTransition !== 'Ninguna' ? Math.round(fps * 0.5) : 0;

    for (let f = 0; f < totalFrames; f++) {
        if (encoderError) throw encoderError;

        const currentTime = f / fps;
        const currentSegment = segments.find(s => currentTime >= s.startSec && currentTime < s.endSec) || segments[segments.length - 1];
        const segIdx = currentSegment.index;
        const elapsedInSeg = Math.max(0, currentTime - currentSegment.startSec);
        const currentMedia = loadedMedia[segIdx];

        // Fondo negro base
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        // Si es video, ajustar su tiempo de forma fluida y sincronizada
        if (currentMedia.type === 'video') {
            const v = currentMedia.element as HTMLVideoElement;
            await seekVideo(v, elapsedInSeg);
        }

        // Verificar si estamos en zona de transición al siguiente segmento
        const timeUntilEnd = currentSegment.endSec - currentTime;
        const framesUntilEnd = Math.round(timeUntilEnd * fps);
        const hasNextSegment = segIdx < loadedMedia.length - 1;

        if (transitionFrames > 0 && hasNextSegment && framesUntilEnd <= transitionFrames) {
            // Transición suave (Crossfade)
            const progress = (transitionFrames - framesUntilEnd) / transitionFrames;
            drawMedia(currentMedia.element, currentMedia.width, currentMedia.height, 1 - progress);

            const nextMedia = loadedMedia[segIdx + 1];
            if (nextMedia.type === 'video') {
                const nextV = nextMedia.element as HTMLVideoElement;
                await seekVideo(nextV, 0);
            }
            drawMedia(nextMedia.element, nextMedia.width, nextMedia.height, progress);
        } else {
            drawMedia(currentMedia.element, currentMedia.width, currentMedia.height, 1.0);
        }

        // Subtítulos si están configurados
        if (subtitleConfig?.enabled && currentMedia.text) {
            ctx.save();
            ctx.fillStyle = subtitleConfig.color || '#ffffff';
            ctx.font = `bold ${subtitleConfig.fontSize || 32}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const y = subtitleConfig.position === 'top' ? 80 : subtitleConfig.position === 'center' ? height / 2 : height - 80;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 6;
            ctx.fillText(currentMedia.text, width / 2, y);
            ctx.restore();
        }

        const videoFrame = new VideoFrame(canvas, {
            timestamp: Math.round(currentTime * 1_000_000),
            duration: defaultFrameDuration
        });

        if (videoEncoder.encodeQueueSize > 40) {
            await videoEncoder.flush();
        }

        videoEncoder.encode(videoFrame, { keyFrame: f % 30 === 0 });
        videoFrame.close();

        if (f % 15 === 0) {
            onProgress?.(10 + Math.round((f / totalFrames) * 75));
        }
    }

    await videoEncoder.flush();
    videoEncoder.close();

    // 6. Codificar Audio
    onStatus?.("Codificando audio unificado...");
    const channels: Float32Array[] = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        channels.push(audioBuffer.getChannelData(c));
    }

    const totalSamples = channels[0].length;
    const samplesPerChunk = audioBuffer.sampleRate;

    for (let offset = 0; offset < totalSamples; offset += samplesPerChunk) {
        if (encoderError) throw encoderError;
        const length = Math.min(samplesPerChunk, totalSamples - offset);
        const timestamp = Math.round((offset / audioBuffer.sampleRate) * 1_000_000);

        const planarBuffer = new Float32Array(length * channels.length);
        for (let c = 0; c < channels.length; c++) {
            planarBuffer.set(channels[c].slice(offset, offset + length), c * length);
        }

        const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: length,
            numberOfChannels: channels.length,
            timestamp,
            data: planarBuffer
        });

        audioEncoder.encode(audioData);
        audioData.close();
    }

    await audioEncoder.flush();
    audioEncoder.close();

    // 7. Finalizar
    onStatus?.("Generando archivo MP4 final...");
    muxer.finalize();
    const { buffer } = muxer.target;
    onProgress?.(100);

    return new Blob([buffer], { type: 'video/mp4' });
}

export const exportVideoViaMuxer = async (
    images: AdImage[],
    audioBuffer: AudioBuffer | SimpleAudioBuffer,
    stitchedAudio: { url: string; durations: number[]; imageIndices?: number[] } | null,
    options: ExportOptions
): Promise<Blob> => {
    // Si la secuencia contiene clips de video, usamos el renderizador secuencial avanzado
    const containsVideos = images.some(img => img.mediaType === 'video');
    if (containsVideos) {
        return exportSequenceWithVideos(images, audioBuffer, stitchedAudio, options);
    }

    // Si solo son imágenes estáticas, usamos el Web Worker en segundo plano
    const { onProgress, onStatus } = options;

    // 1. Extract Audio Data to simple arrays (Transferable-ish)
    const channels: Float32Array[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    // 2. Prepare Worker Data
    const workerData = {
        images: images.map(img => ({ url: img.url, text: img.text })),
        audioChannels: channels,
        audioSampleRate: audioBuffer.sampleRate,
        audioDuration: audioBuffer.duration,
        stitchedAudio,
        width: options.width,
        height: options.height,
        fps: options.fps,
        bitrate: options.bitrate,
        audioBitrate: options.audioBitrate,
        imageFit: options.imageFit,
        imageScale: options.imageScale,
        subtitleConfig: options.subtitleConfig
    };

    return new Promise((resolve, reject) => {
        const worker = new VideoWorker();

        worker.onmessage = (e) => {
            const { type, value, text, blob, error } = e.data;
            switch (type) {
                case 'STATUS':
                    if (onStatus && text) onStatus(text);
                    break;
                case 'PROGRESS':
                    if (onProgress && value !== undefined) onProgress(value);
                    break;
                case 'DONE':
                    worker.terminate();
                    resolve(blob);
                    break;
                case 'ERROR':
                    worker.terminate();
                    console.error("Worker Error:", error);
                    reject(new Error(error));
                    break;
            }
        };

        worker.onerror = (err) => {
            console.error("Worker generic error:", err);
            worker.terminate();
            reject(err);
        };

        // Start
        worker.postMessage({ type: 'START', data: workerData });
    });
};
