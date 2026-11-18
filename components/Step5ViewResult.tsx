import React, { useState, useEffect, useRef } from 'react';
import { AdImage } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { ArrowPathIcon } from './icons/ArrowPathIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { CogIcon } from './icons/CogIcon';
import { stitchAudioBlobs } from '../services/audioUtils';
import { renderVideoFromPCM, exportVideoViaMediaRecorder, exportVideoViaMuxer } from '../services/videoExporter';

// Inline Icon for Full Screen (Standard Expand - Diagonal Arrows)
const MaximizeIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
  </svg>
);

interface Step5ViewResultProps {
  images: AdImage[];
  audioUrl: string | null;
  onRestart: () => void;
  onEdit: () => void;
}

const aspectRatios: Record<string, string> = {
  'Reel (9:16)': 'aspect-[9/16]',
  'Portrait (4:5)': 'aspect-[4/5]',
  'Cuadrado (1:1)': 'aspect-square',
  'Ancho (16:9)': 'aspect-[16/9]',
};

const transitions: Record<string, string> = {
  'Ninguna': '',
  'Suave (Fade)': 'transition-opacity duration-700',
  'Lento (Fade)': 'transition-opacity duration-[1500ms]',
  'Flash': 'transition-opacity duration-150',
};

const speeds = [0.75, 1.0, 1.25, 1.5];

const Step5ViewResult: React.FC<Step5ViewResultProps> = ({ images, audioUrl, onRestart, onEdit }) => {
  // PLAYBACK STATE
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // STITCHING STATE
  const [isStitching, setIsStitching] = useState(false);
  const [stitchedAudio, setStitchedAudio] = useState<{ url: string, durations: number[], imageIndices?: number[] } | null>(null);

  // CONFIG STATE
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('Reel (9:16)');
  const [selectedTransition, setSelectedTransition] = useState('Suave (Fade)');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [imageFit, setImageFit] = useState<'cover' | 'contain' | 'blur' | 'fill'>('cover');
  const [imageScale, setImageScale] = useState(100);
  const [showSettings, setShowSettings] = useState(false);

  // SUBTITLE STATE
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleFontSize, setSubtitleFontSize] = useState(30);
  const [subtitleColor, setSubtitleColor] = useState('#ffffff');
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [showSubtitleBg, setShowSubtitleBg] = useState(false);
  const [wordsPerLine, setWordsPerLine] = useState(4);
  const [previewText, setPreviewText] = useState("");

  // RECORDING STATE
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [statusText, setStatusText] = useState("Iniciando...");

  // REFS
  const audioRef = useRef<HTMLAudioElement>(null);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const indexRef = useRef(0); // Sync ref for the recorder loop
  const isCancelledRef = useRef(false); // To abort recording
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // DETERMINE MODE
  const hasVideos = images.some(img => img.mediaType === 'video');
  const needsStitching = !audioUrl && images.length > 0 && (!!images[0].audioUrl || hasVideos);

  // --- STITCHING LOGIC ---
  useEffect(() => {
    if (needsStitching && !stitchedAudio && !isStitching) {
      const processAudio = async () => {
        setIsStitching(true);
        try {
          const items = images.map((img, i) => ({
            url: img.audioUrl || img.url,
            duration: img.duration || 4,
            index: i
          }));

          const result = await stitchAudioBlobs(items);
          setStitchedAudio({ ...result, imageIndices: items.map(it => it.index) });
        } catch (e) {
          console.error("Audio stitching failed:", e);
        } finally {
          setIsStitching(false);
        }
      };
      processAudio();
    }
  }, [needsStitching, images, stitchedAudio, isStitching]);

  // Sync video elements with active slide playback
  useEffect(() => {
    videoRefs.current.forEach((vEl, idx) => {
      if (!vEl) return;
      if (idx === currentImageIndex && isPlaying) {
        vEl.play().catch(() => {});
      } else {
        vEl.pause();
      }
    });
  }, [currentImageIndex, isPlaying]);

  // The actual source we play
  const activeAudioUrl = audioUrl || stitchedAudio?.url || undefined;

  // --- SYNC REFS ---
  useEffect(() => {
    indexRef.current = currentImageIndex;
  }, [currentImageIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);


  // --- TIME UPDATE (TIMELINE) ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (isRecording) return;

      const duration = audio.duration || 1;
      const currentTime = audio.currentTime;
      setProgress((currentTime / duration) * 100);

      // Determine Image Index
      if (stitchedAudio) {
        // Sequential Timing Logic
        let accumulatedTime = 0;
        let foundIndex = images.length - 1; // Default to last

        for (let i = 0; i < stitchedAudio.durations.length; i++) {
          accumulatedTime += stitchedAudio.durations[i];
          // If current time is within this segment
          if (currentTime < accumulatedTime) {
            foundIndex = stitchedAudio.imageIndices ? stitchedAudio.imageIndices[i] : i;
            break;
          }
        }
        setCurrentImageIndex(foundIndex);

      } else {
        // Simple Linear Logic (Pre-recorded single file)
        const idx = Math.floor((currentTime / duration) * images.length);
        setCurrentImageIndex(Math.min(idx, images.length - 1));
      }
    };

    const handleEnded = () => {
      if (isRecording) return;
      setIsPlaying(false);
      setProgress(100);
      setCurrentImageIndex(images.length - 1);
    };

    const handlePlay = () => !isRecording && setIsPlaying(true);
    const handlePause = () => !isRecording && setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [stitchedAudio, images.length, isRecording]);

  // Clean AudioCtx
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  // TYPEWRITER EFFECT FOR PREVIEW
  useEffect(() => {
    if (!showSubtitles) {
      setPreviewText("");
      return;
    }

    let rafId: number;
    const updateText = () => {
      const audio = audioRef.current;
      if (!audio) return;

      const currentTime = audio.currentTime;
      const currentText = (images[currentImageIndex]?.text || "").trim();

      if (!currentText) { setPreviewText(""); return; }

      let startTime = 0;
      let duration = 0;

      if (stitchedAudio && stitchedAudio.durations.length > 0) {
        for (let i = 0; i < currentImageIndex; i++) {
          startTime += stitchedAudio.durations[i] || 0;
        }
        duration = stitchedAudio.durations[currentImageIndex] || 3;
      } else {
        const totalDur = audio.duration || (images.length * 3);
        duration = totalDur / images.length;
        startTime = currentImageIndex * duration;
      }

      const elapsed = Math.max(0, currentTime - startTime);

      // --- CHUNK / KARAOKE LOGIC (Character Weighted) ---
      const words = currentText.split(/\s+/);
      const safeWPL = wordsPerLine || 4;

      // Build chunks
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += safeWPL) {
        chunks.push(words.slice(i, i + safeWPL).join(' '));
      }

      // Calculate weighted durations
      const chunkWeights = chunks.map(c => c.length + 3);
      const totalWeight = chunkWeights.reduce((a, b) => a + b, 0) || 1;

      let currentChunkIdx = 0;
      let chunkStartTime = 0;
      let activeChunkDuration = duration;

      let acc = 0;
      for (let i = 0; i < chunks.length; i++) {
        const thisDur = (chunkWeights[i] / totalWeight) * duration;
        if (elapsed < acc + thisDur) {
          currentChunkIdx = i;
          chunkStartTime = acc;
          activeChunkDuration = thisDur;
          break;
        }
        acc += thisDur;
        // Clamp to last if we overshoot
        if (i === chunks.length - 1) {
          currentChunkIdx = i;
          chunkStartTime = acc - thisDur;
          activeChunkDuration = thisDur;
        }
      }

      const chunkStr = chunks[currentChunkIdx] || "";

      // Typewriter within chunk
      const chunkElapsed = Math.max(0, elapsed - chunkStartTime);
      const progress = Math.min(1, chunkElapsed / (activeChunkDuration * 0.9));

      const charCount = Math.floor(chunkStr.length * progress);
      setPreviewText(chunkStr.substring(0, charCount));

      if (isPlaying) {
        rafId = requestAnimationFrame(updateText);
      }
    };

    updateText();

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, currentImageIndex, showSubtitles, stitchedAudio, images, wordsPerLine]);

  const togglePlayPause = () => {
    if (isRecording || isStitching) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.playbackRate = playbackSpeed;
      audio.play().catch(console.error);
    }
  };

  const replay = () => {
    if (isRecording || isStitching) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentImageIndex(0);
    setProgress(0);
    audio.play().catch(console.error);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isRecording || isStitching) return;
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;

    // Set time
    if (audio.duration) {
      audio.currentTime = percentage * audio.duration;
    }
  };

  const toggleFullScreen = () => {
    if (playerContainerRef.current) {
      if (!document.fullscreenElement) {
        playerContainerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };


  // --- RECORDING LOGIC (RESTORED & SIMPLIFIED) ---
  // const handleDownload = async () => {
  //   if (isRecording) return;
  //   if (needsStitching && !stitchedAudio) return;

  //   setIsRecording(true);
  //   setRecordingProgress(0);
  //   isCancelledRef.current = false;
  //   setIsPlaying(false);

  //   const audio = audioRef.current;
  //   if (!audio) { setIsRecording(false); return; }

  //   // 1. Reset Playback
  //   try {
  //     audio.pause();
  //     audio.currentTime = 0;
  //     setCurrentImageIndex(0);
  //     indexRef.current = 0;
  //   } catch (e) { console.error("Reset error", e); }

  //   // 2. Setup Canvas
  //   const canvas = document.createElement('canvas');
  //   const [wRatio, hRatio] = selectedAspectRatio.match(/(\d+):(\d+)/)!.slice(1).map(Number);
  //   const baseWidth = selectedAspectRatio.includes('16:9') ? 1920 : 1080;
  //   canvas.width = baseWidth;
  //   canvas.height = (baseWidth / wRatio) * hRatio;

  //   const ctx = canvas.getContext('2d', { alpha: false });
  //   if (!ctx) { setIsRecording(false); return; }

  //   // Fill Black
  //   ctx.fillStyle = 'black';
  //   ctx.fillRect(0, 0, canvas.width, canvas.height);

  //   // 3. Audio Context & Destination
  //   let audioCtx = audioContextRef.current;
  //   if (!audioCtx) {
  //     audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  //     audioContextRef.current = audioCtx;
  //   }
  //   await audioCtx.resume();

  //   // Connect Source
  //   let source = mediaSourceNodeRef.current;
  //   if (!source) {
  //     try {
  //       source = audioCtx.createMediaElementSource(audio);
  //       mediaSourceNodeRef.current = source;
  //     } catch (e) { console.warn("Reusing existing media source"); }
  //   }
  //   const dest = audioCtx.createMediaStreamDestination();
  //   if (source) {
  //     try { source.connect(dest); } catch (e) { }
  //   }

  //   // 4. Create Stream & Recorder
  //   const stream = canvas.captureStream(30);
  //   const audioTracks = dest.stream.getAudioTracks();
  //   const combined = new MediaStream([...stream.getVideoTracks(), ...audioTracks]);

  //   // Use WebM for safety, fallback if needed
  //   let mimeType = 'video/webm';
  //   if (!MediaRecorder.isTypeSupported(mimeType)) {
  //     mimeType = 'video/mp4'; // Safari fallback
  //     if (!MediaRecorder.isTypeSupported(mimeType)) {
  //       alert("Tu navegador no soporta la grabación.");
  //       setIsRecording(false);
  //       return;
  //     }
  //   }

  //   const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 5000000 });
  //   const chunks: BlobPart[] = [];

  //   recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  //   recorder.onstop = () => {
  //     try { source?.disconnect(dest); } catch { }
  //     if (isCancelledRef.current) return;

  //     const blob = new Blob(chunks, { type: mimeType });
  //     if (blob.size > 0) {
  //       const url = URL.createObjectURL(blob);
  //       const a = document.createElement('a');
  //       a.href = url;
  //       a.download = `anuncio_ia_${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
  //       a.click();
  //     } else {
  //       alert("Video vacío. Por favor intenta de nuevo.");
  //     }
  //   };

  //   recorder.start();

  //   // 5. Drawing Loop
  //   let drawing = true;
  //   const draw = () => {
  //     if (!drawing) return;
  //     const currentIdx = indexRef.current;
  //     const imgElement = imageRefs.current[currentIdx];

  //     ctx.fillStyle = 'black';
  //     ctx.fillRect(0, 0, canvas.width, canvas.height);

  //     if (imgElement) {
  //       const cw = canvas.width;
  //       const ch = canvas.height;
  //       const iw = imgElement.naturalWidth;
  //       const ih = imgElement.naturalHeight;
  //       const scaleFactor = imageScale / 100;

  //       // Simplified rendering logic blocks
  //       if (imageFit === 'cover') {
  //         const scale = Math.max(cw / iw, ch / ih) * scaleFactor;
  //         const finalW = iw * scale;
  //         const finalH = ih * scale;
  //         ctx.drawImage(imgElement, (cw - finalW) / 2, (ch - finalH) / 2, finalW, finalH);
  //       } else if (imageFit === 'blur') {
  //         // ... Blur Logic
  //         const scaleCover = Math.max(cw / iw, ch / ih);
  //         ctx.save();
  //         ctx.filter = 'blur(40px) brightness(0.6)';
  //         ctx.drawImage(imgElement, (cw / 2) - (iw / 2) * scaleCover - 10, (ch / 2) - (ih / 2) * scaleCover - 10, iw * scaleCover + 20, ih * scaleCover + 20);
  //         ctx.restore();

  //         const scaleContain = Math.min(cw / iw, ch / ih) * scaleFactor;
  //         const finalW = iw * scaleContain;
  //         const finalH = ih * scaleContain;
  //         ctx.save();
  //         ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 20;
  //         ctx.drawImage(imgElement, (cw - finalW) / 2, (ch - finalH) / 2, finalW, finalH);
  //         ctx.restore();

  //       } else if (imageFit === 'fill') {
  //         const finalW = cw * scaleFactor;
  //         const finalH = ch * scaleFactor;
  //         ctx.drawImage(imgElement, (cw - finalW) / 2, (ch - finalH) / 2, finalW, finalH);
  //       } else {
  //         // Contain
  //         const scale = Math.min(cw / iw, ch / ih) * scaleFactor;
  //         const finalW = iw * scale;
  //         const finalH = ih * scale;
  //         ctx.drawImage(imgElement, (cw - finalW) / 2, (ch - finalH) / 2, finalW, finalH);
  //       }
  //     }
  //     requestAnimationFrame(draw);
  //   };
  //   draw();

  //   // 6. Playback Control
  //   try {
  //     audio.currentTime = 0;
  //     audio.playbackRate = playbackSpeed;
  //     await audio.play();

  //     let duration = audio.duration;
  //     // Wait safely for duration
  //     if (!Number.isFinite(duration) || duration === 0) {
  //       await new Promise(r => setTimeout(r, 200));
  //       duration = audio.duration || 10;
  //     }

  //     while (!audio.paused && !audio.ended && !isCancelledRef.current) {
  //       const t = audio.currentTime;
  //       setRecordingProgress(Math.min(100, Math.round((t / duration) * 100)));

  //       // Sync Logic
  //       if (stitchedAudio) {
  //         let acc = 0;
  //         let found = images.length - 1;
  //         for (let i = 0; i < stitchedAudio.durations.length; i++) {
  //           acc += stitchedAudio.durations[i];
  //           if (t < acc) { found = i; break; }
  //         }
  //         indexRef.current = found;
  //       } else {
  //         const idx = Math.floor((t / duration) * images.length);
  //         indexRef.current = Math.min(idx, images.length - 1);
  //       }
  //       await new Promise(r => requestAnimationFrame(r));
  //     }

  //   } catch (e) {
  //     console.error("Playback error:", e);
  //   } finally {
  //     drawing = false;
  //     if (recorder.state === 'recording') recorder.stop();
  //     setIsRecording(false);
  //     setRecordingProgress(0);
  //     setCurrentImageIndex(0);
  //     indexRef.current = 0;
  //   }
  // };

  // const handleDownload = async () => {
  //   if (isRecording) return;
  //   setIsRecording(true);
  //   setRecordingProgress(0);
  //   isCancelledRef.current = false;

  //   // Pause Playback
  //   if (audioRef.current) audioRef.current.pause();

  //   try {
  //     const [wRatio, hRatio] = selectedAspectRatio.match(/(\d+):(\d+)/)!.slice(1).map(Number);
  //     const baseWidth = selectedAspectRatio.includes('16:9') ? 1920 : 1080;
  //     const width = baseWidth % 2 === 0 ? baseWidth : baseWidth - 1;
  //     const heightCalc = Math.round((baseWidth / wRatio) * hRatio);
  //     const height = heightCalc % 2 === 0 ? heightCalc : heightCalc - 1;

  //     const blob = await renderVideo(
  //       images,
  //       audioUrl,
  //       stitchedAudio,
  //       {
  //         width,
  //         height,
  //         fps: 30,
  //         bitrate: 6_000_000,
  //         audioBitrate: 128_000,
  //         imageFit,
  //         imageScale,
  //         selectedTransition,
  //         transitions,
  //         onProgress: (p) => setRecordingProgress(Math.round(p))
  //       }
  //     );

  //     if (!blob || blob.size === 0) throw new Error("Generated Blob is empty");

  //     const url = URL.createObjectURL(blob);
  //     const a = document.createElement('a');
  //     a.href = url;
  //     a.download = `anuncio_hq_${Date.now()}.mp4`;
  //     a.click();

  //     setTimeout(() => URL.revokeObjectURL(url), 5000);

  //   } catch (e) {
  //     console.error("Export Error:", e);
  //     alert("Error exportando video: " + (e instanceof Error ? e.message : String(e)));
  //   } finally {
  //     setIsRecording(false);
  //     setRecordingProgress(0);
  //   }
  // };


  const handleDownload = async () => {
    if (isRecording) return;

    setIsRecording(true);
    setRecordingProgress(1);
    setStatusText("Iniciando...");
    console.log("Download started");

    if (audioRef.current) audioRef.current.pause();

    const [wRatio, hRatio] = selectedAspectRatio.match(/(\d+):(\d+)/)!.slice(1).map(Number);
    const baseWidth = selectedAspectRatio.includes('16:9') ? 1920 : 1080;
    const width = baseWidth % 2 === 0 ? baseWidth : baseWidth - 1;
    const heightCalc = Math.round((baseWidth / wRatio) * hRatio);
    const height = heightCalc % 2 === 0 ? heightCalc : heightCalc - 1;



    try {
      const audioEl = audioRef.current;
      if (!audioEl) throw new Error("Audio element not found");

      setRecordingProgress(2);
      setStatusText("Verificando audio...");
      if (audioEl.readyState < 2) {
        await new Promise<void>(res => {
          const timer = setTimeout(res, 3000);
          audioEl.oncanplay = () => { clearTimeout(timer); res(); };
        });
      }

      const audioCtx = new AudioContext({ sampleRate: 44100 });

      setRecordingProgress(3);
      setStatusText("Descargando audio...");
      const response = await fetch(audioEl.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioData = await audioCtx.decodeAudioData(arrayBuffer);

      setRecordingProgress(5);
      setStatusText("Normalizando audio...");

      const offlineCtx = new OfflineAudioContext(
        2,
        audioData.duration * 44100,
        44100
      );

      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = audioData;
      offlineSource.connect(offlineCtx.destination);
      offlineSource.start();

      const renderedBuffer = await offlineCtx.startRendering();

      setRecordingProgress(10);

      setRecordingProgress(15);
      setStatusText("Renderizando video de alta calidad (Offline Muxer)...");

      const blob = await exportVideoViaMuxer(
        images,
        audioData,
        stitchedAudio,
        {
          width,
          height,
          fps: 30,
          bitrate: 6_000_000,
          audioBitrate: 128_000,
          imageFit,
          imageScale,
          selectedTransition,
          transitions,
          onProgress: (p) => {
            const val = 15 + (p * 0.85);
            setRecordingProgress(Math.round(val));
          },
          onStatus: (t) => setStatusText(t),
          subtitleConfig: {
            enabled: showSubtitles,
            fontSize: subtitleFontSize,
            color: subtitleColor,
            position: subtitlePosition,
            showBackground: showSubtitleBg,
            wordsPerLine: wordsPerLine
          }
        }
      );

      console.log("Main: Blob generated, Size:", blob.size);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = 'mp4';
      a.download = `anuncio_hq_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      setIsRecording(false);
      setRecordingProgress(0);
      setStatusText("");

    } catch (e) {
      console.error("Export error:", e);
      setStatusText("Error critical: " + String(e));
      alert("Error exportando: " + String(e));
      setIsRecording(false);
    }
  };



  const cancelRecording = () => {
    isCancelledRef.current = true;
    if (audioRef.current) audioRef.current.pause();
  };

  // --- SETTINGS RENDER ---
  const renderSettingsModal = () => (
    <div className="fixed top-24 right-4 z-50 w-80 bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl flex flex-col p-4 animate-fadeIn shadow-indigo-500/10 border-indigo-500/50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <CogIcon className="w-5 h-5 text-indigo-400" /> Configuración
        </h3>
        <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
          <div className="bg-gray-800 rounded-full p-1 hover:bg-gray-700 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar pr-1">
        {/* FORMAT */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Formato</label>
          <div className="flex flex-wrap gap-1 bg-gray-800 rounded-lg p-1">
            {Object.keys(aspectRatios).map(ratio => (
              <button key={ratio} onClick={() => setSelectedAspectRatio(ratio)}
                className={`flex-1 min-w-[30%] py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${selectedAspectRatio === ratio ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                {ratio.split(' ')[0]} <span className="opacity-50 text-[9px]">{ratio.match(/\((.*?)\)/)?.[1]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* IMAGE FIT */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Ajuste de Imagen</label>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button onClick={() => setImageFit('contain')} className={`flex-1 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${imageFit === 'contain' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              Bordes
            </button>
            <button onClick={() => setImageFit('blur')} className={`flex-1 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${imageFit === 'blur' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              Cine/Blur
            </button>
            <button onClick={() => setImageFit('cover')} className={`flex-1 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${imageFit === 'cover' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              Zoom
            </button>
            <button onClick={() => setImageFit('fill')} className={`flex-1 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${imageFit === 'fill' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              Estirar
            </button>
          </div>
        </div>

        {/* TRANSITION */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Transición</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(transitions).map(t => (
              <button key={t} onClick={() => setSelectedTransition(t)}
                className={`px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${selectedTransition === t ? 'bg-indigo-600 text-white shadow ring-1 ring-indigo-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* SPEED */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Velocidad</label>
          <div className="flex bg-gray-800 rounded-lg p-1 justify-between">
            {speeds.map(s => (
              <button key={s} onClick={() => setPlaybackSpeed(s)} className={`flex-1 py-1.5 font-mono text-xs font-medium rounded-md transition-all ${playbackSpeed === s ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* SUBTITLES */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Subtítulos</label>
            <label className="inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={showSubtitles} onChange={(e) => setShowSubtitles(e.target.checked)} className="sr-only peer" />
              <div className="relative w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {showSubtitles && (
            <div className="space-y-3 bg-gray-800/50 p-2 rounded-lg border border-gray-700 animate-fadeIn">
              {/* Size */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-12">Tamaño</span>
                <input type="range" min="20" max="100" value={subtitleFontSize} onChange={(e) => setSubtitleFontSize(Number(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                <span className="text-[9px] text-gray-500 w-4">{subtitleFontSize}</span>
              </div>
              {/* Color */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-12">Color</span>
                <div className="flex gap-2 flex-wrap">
                  {['#ffffff', '#fbbf24', '#f87171', '#60a5fa', '#a3e635', '#000000'].map(c => (
                    <button key={c} onClick={() => setSubtitleColor(c)} className={`w-4 h-4 rounded-full border transition ${subtitleColor === c ? 'border-white scale-125 ring-1 ring-white/50' : 'border-transparent opacity-80 hover:opacity-100'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              {/* Position & Background */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-12">Estilo</span>
                <div className="flex flex-1 gap-2">
                  {/* Position Group */}
                  <div className="flex flex-1 bg-gray-700 rounded p-0.5">
                    <button onClick={() => setSubtitlePosition('top')} className={`flex-1 text-[9px] py-1 rounded transition ${subtitlePosition === 'top' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Arriba</button>
                    <button onClick={() => setSubtitlePosition('center')} className={`flex-1 text-[9px] py-1 rounded transition ${subtitlePosition === 'center' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Centro</button>
                    <button onClick={() => setSubtitlePosition('bottom')} className={`flex-1 text-[9px] py-1 rounded transition ${subtitlePosition === 'bottom' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Abajo</button>
                  </div>
                  {/* Background Toggle */}
                  <button onClick={() => setShowSubtitleBg(!showSubtitleBg)} className={`px-2 rounded text-[9px] border transition font-medium ${showSubtitleBg ? 'bg-white text-black border-white' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'}`}>
                    Fondo
                  </button>
                </div>
              </div>
              {/* Words Per Line */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-12">Bloque</span>
                <input type="range" min="3" max="12" step="1" value={wordsPerLine} onChange={(e) => setWordsPerLine(Number(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                <span className="text-[9px] text-gray-500 w-4">{wordsPerLine} Pal.</span>
              </div>
            </div>
          )}
        </div>

        {/* IMAGE SCALE */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">
            Escala de Imagen ({imageScale}%)
          </label>
          <input
            type="range"
            min="50"
            max="150"
            step="5"
            value={imageScale}
            onChange={(e) => setImageScale(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-700 text-center">
        <span className="text-[10px] text-gray-500">Los cambios se aplican automáticamente</span>
      </div>
    </div >
  );


  return (
    <div className="flex flex-col h-full min-h-[500px] bg-gray-900 relative">

      {/* --- RECORDING OVERLAY (Fixed & Centered) --- */}
      {isRecording && (
        <div className="fixed inset-0 z-[100] bg-gray-900/95 flex flex-col items-center justify-center p-6 backdrop-blur-sm animate-fadeIn">
          <div className="text-center w-full max-w-md">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2">Renderizando tu Video...</h2>
            <p className="text-indigo-300 text-lg font-medium mb-2 animate-pulse">{statusText}</p>
            <p className="text-gray-400 mb-8">Por favor espera...</p>
            <div className="relative pt-1 mb-8">
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-200/20">
                <div style={{ width: `${recordingProgress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-300"></div>
              </div>
            </div>
            <button
              onClick={cancelRecording}
              className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 rounded-full font-medium transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* HEADER ACTIONS */}
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Resultado Final</h2>
          {isStitching && <span className="text-xs text-indigo-400 animate-pulse flex items-center gap-1">✨ Optimizando audio...</span>}
        </div>
        <div className="relative flex items-center">
          {!showSettings && !isRecording && (
            <div className="absolute right-full mr-3 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full animate-pulse shadow-lg whitespace-nowrap flex items-center gap-1 z-10 pointer-events-none">
              <span>¡Ajusta tu imagen!</span>
              <svg className="w-3 h-3 animate-bounce-horizontal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          )}
          <button
            disabled={isRecording}
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition ${showSettings ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'} ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Configuración de Video"
          >
            <CogIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex items-center justify-center relative bg-black/50 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl p-4 sm:p-8">

        {showSettings && renderSettingsModal()}

        {/* CONTAINER FOR FULL SCREEN */}
        <div
          ref={playerContainerRef}
          className={`relative ${aspectRatios[selectedAspectRatio]} w-full ${selectedAspectRatio.includes('Ancho') ? 'max-w-4xl' : 'max-w-md sm:max-w-lg'} bg-black shadow-2xl ring-4 ring-black rounded-lg overflow-hidden group`}
        >
          {images.map((image, index) => {
            const isCurrent = index === currentImageIndex;
            return (
              <React.Fragment key={image.id}>
                {/* Blur Background Layer */}
                {imageFit === 'blur' && (
                  <img
                    src={image.thumbnailUrl || image.url}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover blur-xl scale-110 brightness-50 z-0 
                              ${isCurrent ? 'opacity-100' : 'opacity-0'}
                              transition-opacity duration-700
                           `}
                  />
                )}
                {/* Media Layer (Video or Image) */}
                {image.mediaType === 'video' ? (
                  <video
                    ref={el => videoRefs.current[index] = el}
                    src={image.url}
                    muted={true}
                    playsInline
                    loop={false}
                    style={{ transform: `scale(${imageScale / 100})` }}
                    className={`absolute inset-0 w-full h-full transition-transform duration-300
                              ${imageFit === 'cover' ? 'object-cover object-center' :
                        imageFit === 'fill' ? 'object-fill' :
                          'object-contain object-center'} 
                              ${imageFit === 'blur' ? 'z-10' : 'z-0'}
                              ${isCurrent ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                              ${transitions[selectedTransition]}
                           `}
                  />
                ) : (
                  <img
                    ref={el => imageRefs.current[index] = el}
                    src={image.url}
                    alt={`Slide ${index}`}
                    style={{ transform: `scale(${imageScale / 100})` }}
                    className={`absolute inset-0 w-full h-full transition-transform duration-300
                              ${imageFit === 'cover' ? 'object-cover object-center' :
                        imageFit === 'fill' ? 'object-fill' :
                          'object-contain object-center'} 
                              ${imageFit === 'blur' ? 'z-10' : 'z-0'}
                              ${isCurrent ? 'opacity-100' : 'opacity-0'}
                              ${transitions[selectedTransition]}
                           `}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* SUBTITLE PREVIEW OVERLAY */}
          {showSubtitles && images[currentImageIndex]?.text && (
            <div
              className="absolute inset-x-0 z-30 pointer-events-none px-8 flex justify-center text-center w-full"
              style={{
                top: subtitlePosition === 'top' ? '60px' : subtitlePosition === 'center' ? '50%' : 'auto',
                bottom: subtitlePosition === 'bottom' ? '80px' : 'auto',
                transform: subtitlePosition === 'center' ? 'translateY(-50%)' : 'none',
              }}
            >
              <p
                className={`${showSubtitleBg ? 'bg-black/60 shadow-xl backdrop-blur-sm' : ''} px-6 py-2 rounded-xl transition-all duration-300`}
                style={{
                  fontSize: `${Math.min(subtitleFontSize, 40)}px`, // Limit preview size slightly to avoid overflow on small screens
                  color: subtitleColor,
                  textShadow: showSubtitleBg ? 'none' : '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
                  lineHeight: 1.3,
                  fontWeight: 'bold',
                  fontFamily: 'Arial, sans-serif',
                  maxWidth: '90%',
                  display: 'inline-block'
                }}
              >
                {previewText}
              </p>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/60 to-transparent z-20 transition-opacity duration-300 opacity-100">
            {/* Progress Bar */}
            <div
              onClick={handleSeek}
              className="w-full bg-white/20 h-2 rounded-full mb-4 cursor-pointer relative group-hover:h-3 transition-all"
            >
              <div className="bg-indigo-500 h-full rounded-full relative" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            </div>

            {/* Controls Row - SPACER LEFT, CENTER CONTROLS, BUTTON RIGHT */}
            <div className="flex items-center justify-between px-2">
              <div className="w-9">{/* Spacer */}</div>

              <div className="flex items-center gap-6">
                <button onClick={replay} className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10" title="Reiniciar">
                  <ArrowPathIcon className="w-5 h-5" />
                </button>
                <button onClick={togglePlayPause} className="p-3 rounded-full bg-white text-black hover:scale-105 transition shadow">
                  {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
                </button>
                <button onClick={handleDownload} disabled={isRecording || isStitching} className={`p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 ${isStitching ? 'animate-pulse' : ''}`} title="Descargar Video">
                  <DownloadIcon className="w-5 h-5" />
                </button>
              </div>

              <button onClick={toggleFullScreen} className="p-2 text-white/70 hover:text-white" title="Pantalla Completa">
                <MaximizeIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER NAV */}
      <div className="mt-6 flex justify-between items-center text-sm text-gray-400 px-2">
        <button onClick={onEdit} disabled={isRecording} className={`hover:text-white transition flex items-center gap-2 ${isRecording ? 'opacity-50' : ''}`}>&larr; Editar</button>
        <button onClick={onRestart} disabled={isRecording} className={`hover:text-white transition ${isRecording ? 'opacity-50' : ''}`}>Reiniciar</button>
      </div>

      <audio ref={audioRef} src={activeAudioUrl} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};

export default Step5ViewResult;
