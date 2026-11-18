import React, { useState, useRef, useEffect } from 'react';
import { ClonedVoice, AudioGenerationMode } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { UploadIcon } from './icons/UploadIcon';
import { PauseIcon } from './icons/PauseIcon';
import { CheckIcon } from './icons/CheckIcon';
import { MicrophoneIcon } from './icons/MicrophoneIcon';

interface Step3SelectVoiceProps {
  voices: ClonedVoice[];
  selectedVoiceId: string | null;
  audioMode: AudioGenerationMode;
  uploadedAdAudio: File | null;
  geminiVoiceName: string;
  onSelectVoice: (id: string | null) => void;
  onSetAudioMode: (mode: AudioGenerationMode) => void;
  onSetUploadedAdAudio: (file: File | null) => void;
  onSetGeminiVoiceName: (name: string) => void;
  onCloneVoice: (voiceName: string, voiceFile: File) => void;
  onAdvance: () => void;
  onBack: () => void;
}

const GEMINI_VOICES = [
  { name: 'Kore', label: 'Kore (Femenina, Calmada)' },
  { name: 'Fenrir', label: 'Fenrir (Masculina, Profunda)' },
  { name: 'Puck', label: 'Puck (Masculina, Enérgica)' },
  { name: 'Aoede', label: 'Aoede (Femenina, Elegante)' },
  { name: 'Charon', label: 'Charon (Masculina, Grave)' }
];

const Step3SelectVoice: React.FC<Step3SelectVoiceProps> = ({
  voices, selectedVoiceId, audioMode, uploadedAdAudio, geminiVoiceName,
  onSelectVoice, onSetAudioMode, onSetUploadedAdAudio, onSetGeminiVoiceName,
  onCloneVoice, onAdvance, onBack
}) => {
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adAudioInputRef = useRef<HTMLInputElement>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  // RECORDING STATE
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // PREVIEW STATE
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Manage Audio Object URL lifecycle
  useEffect(() => {
    // Cleanup previous URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    // Reset audio player
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);

    // Create new URL if file exists
    if (uploadedAdAudio) {
      audioUrlRef.current = URL.createObjectURL(uploadedAdAudio);
    }

    return () => {
      // Cleanup on unmount
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [uploadedAdAudio]);

  // Helper to toggle preview
  const handleTogglePreview = () => {
    if (!audioUrlRef.current) return;

    if (isPreviewPlaying) {
      previewAudioRef.current?.pause();
      setIsPreviewPlaying(false);
    } else {
      // Create audio instance if needed
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio(audioUrlRef.current);
        previewAudioRef.current.onended = () => setIsPreviewPlaying(false);
      }
      previewAudioRef.current.play();
      setIsPreviewPlaying(true);
    }
  };

  // Handle Audio Playback
  useEffect(() => {
    const audio = audioRef.current;
    const onEnded = () => setPlayingVoiceId(null);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  const handlePlaySample = (sampleUrl: string, id: string) => {
    const audio = audioRef.current;
    if (playingVoiceId === id) {
      audio.pause();
      setPlayingVoiceId(null);
    } else {
      if (!audio.paused) audio.pause();
      audio.src = sampleUrl;
      audio.play().catch(e => {
        console.error("Error playing audio:", e);
        setPlayingVoiceId(null);
      });
      setPlayingVoiceId(id);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setNewVoiceFile(event.target.files[0]);
    }
  };

  const handleAdAudioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onSetUploadedAdAudio(event.target.files[0]);
    }
  };

  const handleCloneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVoiceName && newVoiceFile) {
      onCloneVoice(newVoiceName, newVoiceFile);
      setNewVoiceName('');
      setNewVoiceFile(null);
      setShowCloneForm(false);
    }
  };

  // RECORDING HANDLERS
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const file = new File([blob], `grabacion_voz_${new Date().getTime()}.wav`, { type: 'audio/wav' });
        onSetUploadedAdAudio(file);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // setIsRecording will be set in onstop
    }
  };


  // Check if current step is valid to proceed
  const isValid = () => {
    if (audioMode === AudioGenerationMode.CLONE) return !!selectedVoiceId;
    if (audioMode === AudioGenerationMode.PRE_RECORDED) return !!uploadedAdAudio;
    if (audioMode === AudioGenerationMode.GEMINI_TTS) return !!geminiVoiceName;
    return false;
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 mb-6">
      <h2 className="text-xl font-semibold text-white mb-6">Paso 3: Audio del Anuncio</h2>

      {/* TABS */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${audioMode === AudioGenerationMode.GEMINI_TTS ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          onClick={() => onSetAudioMode(AudioGenerationMode.GEMINI_TTS)}
        >
          Voz IA (Estándar)
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${audioMode === AudioGenerationMode.PRE_RECORDED ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          onClick={() => onSetAudioMode(AudioGenerationMode.PRE_RECORDED)}
        >
          Subir Audio Anuncio Listo
        </button>
        {/* 
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${audioMode === AudioGenerationMode.CLONE ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          onClick={() => onSetAudioMode(AudioGenerationMode.CLONE)}
        >
          Clonar Voz
        </button>
        */}
      </div>

      {/* CONTENT: CLONE */}
      {/* 
      {audioMode === AudioGenerationMode.CLONE && (
        <div className="space-y-4 animate-fadeIn">
          <p className="text-gray-400 text-sm mb-2">Selecciona la voz referencia o sube una nueva referencia. El sistema leerá el texto usando esta voz.</p>
          <div>
            <label htmlFor="voice-select" className="block text-sm font-medium text-gray-300 mb-2">Voces Guardadas</label>
            <div className="flex items-center gap-2">
              <select
                id="voice-select"
                value={selectedVoiceId ?? ''}
                onChange={(e) => onSelectVoice(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="" disabled>Selecciona una voz...</option>
                {voices.map(voice => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} {voice.isCustom ? '(Subido)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const selectedVoice = voices.find(v => v.id === selectedVoiceId);
                  if (selectedVoice) handlePlaySample(selectedVoice.sampleUrl, selectedVoice.id);
                }}
                className="p-2.5 bg-gray-700 rounded-md hover:bg-gray-600 transition"
                title="Reproducir muestra"
                disabled={!selectedVoiceId}
              >
                {playingVoiceId === selectedVoiceId ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="text-center text-gray-400 text-sm py-2">- o -</div>

          {!showCloneForm ? (
            <button onClick={() => setShowCloneForm(true)} className="w-full text-center py-2 px-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-indigo-500 hover:text-indigo-400 transition">
              + Nueva Voz (Grabar/Subir)
            </button>
          ) : (
            <form onSubmit={handleCloneSubmit} className="bg-gray-700/50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-sm text-gray-200">Nueva Voz de Referencia</h3>
              <input
                type="text"
                placeholder="Nombre (ej: Pastor Juan)"
                value={newVoiceName}
                onChange={(e) => setNewVoiceName(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/wav, audio/mpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 text-left py-2 px-4 border border-gray-600 bg-gray-900 rounded-lg hover:bg-gray-800 transition">
                  <UploadIcon className="w-5 h-5 text-gray-400" />
                  {newVoiceFile ? newVoiceFile.name : 'Subir archivo de audio (10-20 seg)'}
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCloneForm(false)} className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" disabled={!newVoiceName || !newVoiceFile} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50">Guardar Voz</button>
              </div>
            </form>
          )}
        </div>
      )}
      */}

      {/* CONTENT: PRE-RECORDED (WITH RECORDING) */}
      {audioMode === AudioGenerationMode.PRE_RECORDED && (
        <div className="space-y-6 animate-fadeIn text-center py-4">
          <p className="text-gray-400 text-sm">Sube el audio final de tu anuncio o graba tu voz directamente.</p>

          {/* Section 1: Upload */}
          <input
            type="file"
            ref={adAudioInputRef}
            accept="audio/wav, audio/mpeg, audio/mp3"
            onChange={handleAdAudioChange}
            className="hidden"
          />

          {!uploadedAdAudio && !isRecording && (
            <>
              <div
                onClick={() => adAudioInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 rounded-xl p-6 cursor-pointer hover:border-indigo-500 hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex flex-col items-center gap-2">
                  <UploadIcon className="w-8 h-8 text-gray-400" />
                  <span className="font-medium text-gray-300">Subir archivo (.mp3, .wav)</span>
                </div>
              </div>

              <div className="flex items-center gap-4 my-2">
                <div className="h-px bg-gray-700 flex-1"></div>
                <span className="text-gray-500 text-xs uppercase">O Graba tu Voz</span>
                <div className="h-px bg-gray-700 flex-1"></div>
              </div>

              <button
                onClick={startRecording}
                className="w-full py-4 rounded-xl bg-gray-700 hover:bg-red-600/20 hover:text-red-400 border border-gray-600 hover:border-red-500/50 transition-all flex flex-col items-center gap-2 group"
              >
                <MicrophoneIcon className="w-8 h-8 text-gray-400 group-hover:text-red-500 transition-colors" />
                <span className="font-medium">Grabar Audio Ahora</span>
              </button>
            </>
          )}

          {/* Section 2: Recording State */}
          {isRecording && (
            <div className="border-2 border-red-500/50 bg-red-500/10 rounded-xl p-8 animate-pulse relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-slide"></div>
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-red-500 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                  <MicrophoneIcon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Grabando...</h3>
                <button
                  onClick={stopRecording}
                  className="px-6 py-2 bg-white text-red-600 font-bold rounded-full hover:scale-105 transition"
                >
                  Detener Grabación
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Result State */}
          {uploadedAdAudio && !isRecording && (
            <div className="border-2 border-green-500 bg-green-500/10 rounded-xl p-6 relative">
              <button
                onClick={() => onSetUploadedAdAudio(null)}
                className="absolute top-2 right-2 p-1 text-green-300 hover:text-white bg-green-900/50 rounded-full"
                title="Eliminar audio"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-center gap-3">
                <CheckIcon className="w-12 h-12 text-green-500" />
                <div>
                  <h3 className="font-bold text-green-400 text-lg">¡Audio Listo!</h3>
                  <p className="text-green-300/80 text-sm truncate max-w-[200px]">{uploadedAdAudio.name}</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleTogglePreview}
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg border ${isPreviewPlaying
                      ? 'bg-green-500 border-green-400 text-white shadow-green-500/40 ring-2 ring-green-500/20'
                      : 'bg-green-600 border-green-500 text-white hover:bg-green-500 hover:shadow-green-500/20'
                      }`}
                  >
                    {isPreviewPlaying ? (
                      <>
                        <PauseIcon className="w-4 h-4" />
                        <span className="flex items-center gap-1">
                          Reproduciendo
                          {/* CSS Animation Bars */}
                          <div className="flex items-end gap-0.5 h-3 ml-1 pb-0.5">
                            <div className="w-0.5 bg-white rounded-full animate-[bounce_0.8s_infinite] h-2"></div>
                            <div className="w-0.5 bg-white rounded-full animate-[bounce_1s_infinite] h-3"></div>
                            <div className="w-0.5 bg-white rounded-full animate-[bounce_0.6s_infinite] h-1.5"></div>
                            <div className="w-0.5 bg-white rounded-full animate-[bounce_0.9s_infinite] h-2.5"></div>
                          </div>
                        </span>
                      </>
                    ) : (
                      <>
                        <PlayIcon className="w-4 h-4" /> Escuchar Audio
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTENT: GEMINI TTS */}
      {audioMode === AudioGenerationMode.GEMINI_TTS && (
        <div className="space-y-4 animate-fadeIn">
          <p className="text-gray-400 text-sm mb-2">Utiliza una voz de alta calidad de Google. Estas voces son rápidas y profesionales, pero no imitan a nadie.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GEMINI_VOICES.map(voice => (
              <div
                key={voice.name}
                onClick={() => onSetGeminiVoiceName(voice.name)}
                className={`p-4 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${geminiVoiceName === voice.name ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}
              >
                <span className={`${geminiVoiceName === voice.name ? 'text-white font-medium' : 'text-gray-300'}`}>{voice.label}</span>
                {geminiVoiceName === voice.name && <CheckIcon className="w-5 h-5 text-indigo-400" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER NAV */}
      <div className="mt-8 pt-6 border-t border-gray-700 flex justify-between items-center">
        <button
          onClick={onBack}
          className="text-gray-300 hover:text-white font-bold py-2 px-4 rounded-lg transition"
        >
          &larr; Volver
        </button>
        <button
          onClick={onAdvance}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:grayscale"
          disabled={!isValid()}
        >
          Confirmar y Continuar
        </button>
      </div>
    </div>
  );
};

export default Step3SelectVoice;