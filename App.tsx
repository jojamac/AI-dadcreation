import React, { useState, useEffect, useCallback } from 'react';
import { AdImage, ClonedVoice, AppStep, AudioGenerationMode, Asset } from './types';
import { extractTextFromImage } from './services/geminiService';
import * as geminiService from './services/geminiService';
import { generateAudio as generateClonedAudio } from './services/huggingFaceService';
import { getClonedVoices as fetchVoices, uploadAndCloneVoice, saveAsset, signInApp } from './services/firebaseService';
import { processMediaFile } from './services/mediaUtils';

import Header from './components/Header';
import Step1UploadImages from './components/Step1UploadImages';
import Step2EditText from './components/Step2EditText';
import Step3SelectVoice from './components/Step3SelectVoice';
import Step4GenerateAd from './components/Step4GenerateAd';
import Step5ViewResult from './components/Step5ViewResult';
import ProgressWizard from './components/ProgressWizard';

export default function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD_IMAGES);
  const [images, setImages] = useState<AdImage[]>([]);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);

  // CACHE (To prevent re-generation)
  const audioCache = React.useRef<Map<string, string>>(new Map());

  // VOICE STATE
  const [audioMode, setAudioMode] = useState<AudioGenerationMode>(AudioGenerationMode.GEMINI_TTS);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [uploadedAdAudio, setUploadedAdAudio] = useState<File | null>(null);
  const [geminiVoiceName, setGeminiVoiceName] = useState<string>('Kore');

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [useOriginalAudio, setUseOriginalAudio] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to check if all images are from history (have audio)
  const allImagesHaveAudio = images.length > 0 && images.every(img => !!img.audioUrl);
  const hasVideos = images.some(img => img.mediaType === 'video');

  useEffect(() => {
    const loadVoices = async () => {
      setIsProcessing(true);

      // Auto-Sign In for Security Rules
      await signInApp();

      setProcessingMessage('Cargando voces...');
      try {
        const voices = await fetchVoices();
        setClonedVoices(voices);
        if (voices.length > 0) {
          setSelectedVoiceId(voices[0].id);
        }
      } catch (e) {
        setError('No se pudieron cargar las voces clonadas.');
        console.error(e);
      } finally {
        setIsProcessing(false);
        setProcessingMessage('');
      }
    };

    loadVoices();
  }, []);

  useEffect(() => {
    if (images.length === 0 && step > AppStep.UPLOAD_IMAGES && step < AppStep.GENERATING) {
      setStep(AppStep.UPLOAD_IMAGES);
    }
  }, [images, step]);

  const handleImagesUpload = async (files: FileList) => {
    setIsProcessing(true);
    setProcessingMessage('Procesando archivos multimedia...');
    try {
      const newItems = await Promise.all(
        Array.from(files).map(file => processMediaFile(file))
      );
      const containsVideos = newItems.some(i => i.mediaType === 'video') || images.some(i => i.mediaType === 'video');
      if (containsVideos) {
        setUseOriginalAudio(true);
      }
      setImages(prev => [...prev, ...newItems]);
      setStep(AppStep.EDIT_TEXT);
    } catch (e) {
      console.error('Error procesando archivos:', e);
      setError('Error al procesar algunos archivos multimedia.');
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleNextFromEditText = () => {
    // Si hay videos y se decidió usar el audio original de los videos, saltamos la selección de voz y vamos a la vista final
    if (hasVideos && useOriginalAudio) {
      setAudioMode(AudioGenerationMode.ORIGINAL_VIDEO);
      setStep(AppStep.VIEW_RESULT);
      return;
    }

    if (allImagesHaveAudio) {
      setStep(AppStep.GENERATE_AD);
    } else {
      setStep(AppStep.SELECT_VOICE);
    }
  };

  const handleAddAssetFromHistory = (asset: Asset) => {
    // Check for duplicates based on URL
    if (images.some(img => img.url === asset.imageUrl)) {
      alert("Esta imagen ya está agregada en la lista.");
      return;
    }

    const newImage: AdImage = {
      id: self.crypto.randomUUID(),
      url: asset.imageUrl,
      text: asset.text,
      audioUrl: asset.audioUrl,
      isFromHistory: true,
      saveToHistory: false,
      // file is undefined here, which marks it as "history item"
    };
    setImages(prev => [...prev, newImage]);
    setStep(AppStep.EDIT_TEXT);
  };

  const handleExtractText = useCallback(async () => {
    // Only process images that have a File (new uploads) and no text yet
    const imagesToProcess = images.filter(img => !img.text && img.file);

    if (imagesToProcess.length === 0) {
      setStep(AppStep.SELECT_VOICE);
      return;
    }

    setIsExtractingText(true);
    setError(null);

    try {
      const processedImages = await Promise.all(
        imagesToProcess.map(async (image) => {
          if (!image.file) return image;
          const text = await extractTextFromImage(image.file);
          return { ...image, text };
        })
      );

      const processedImagesMap = new Map(processedImages.map(img => [img.id, img]));

      setImages(prevImages =>
        prevImages.map(img => processedImagesMap.get(img.id) || img)
      );

    } catch (e) {
      setError('Error al extraer texto. Por favor, inténtelo de nuevo.');
      console.error(e);
    } finally {
      setIsExtractingText(false);
    }
  }, [images]);


  const handleTextChange = (id: string, text: string) => {
    setImages(prevImages => prevImages.map(img => {
      if (img.id === id) {
        // If text changes, invalidate existing audio (unless it's from history, but UI prevents that)
        // We force regeneration by clearing audioUrl
        return { ...img, text, audioUrl: undefined };
      }
      return img;
    }));
  };

  const handleRemoveImage = (id: string) => {
    setImages(prevImages => prevImages.filter(img => img.id !== id));
  };

  const handleToggleSave = (id: string, checked: boolean) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, saveToHistory: checked } : img));
  };

  const handleReorderImages = (newImages: AdImage[]) => {
    setImages(newImages);
  };

  const handleCloneVoice = async (voiceName: string, voiceFile: File) => {
    setIsProcessing(true);
    setProcessingMessage(`Clonando la voz "${voiceName}"...`);
    setError(null);
    try {
      const newVoice = await uploadAndCloneVoice(voiceName, voiceFile);
      setClonedVoices(prev => [...prev, newVoice]);
      setSelectedVoiceId(newVoice.id);
    } catch (e) {
      setError('Error al clonar la voz.');
      console.error(e);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleGenerateAd = async () => {
    if (images.length === 0 && audioMode !== AudioGenerationMode.PRE_RECORDED) {
      setError("Por favor, suba imágenes.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep(AppStep.GENERATING);
    setGeneratedAudioUrl(null);

    try {
      if (audioMode === AudioGenerationMode.PRE_RECORDED) {
        // MODE 1: PRE-RECORDED AUDIO (Single Global Audio)
        if (!uploadedAdAudio) throw new Error("No se ha subido ningún archivo de audio.");
        setProcessingMessage('Procesando audio subido...');
        const globalUrl = URL.createObjectURL(uploadedAdAudio);
        setGeneratedAudioUrl(globalUrl);
        // Clean audioUrl from images just in case
        setImages(prev => prev.map(img => ({ ...img, audioUrl: undefined })));

      } else {
        // MODES 2 & 3: GENERATE SEQUENTIAL AUDIO PER IMAGE
        if (images.some(img => !img.text)) {
          throw new Error("Por favor, asegúrese de que se haya extraído texto para todas las imágenes.");
        }

        const updatedImages = [...images];
        setGeneratedAudioUrl(null); // Ensure global audio is null to trigger Sequential Mode in Step5

        // Cache for audio generation to save API calls
        const currentCache = audioCache.current;

        for (let i = 0; i < updatedImages.length; i++) {
          const img = updatedImages[i];

          // SKIP GENERATION IF AUDIO EXISTS (History items)
          if (img.audioUrl && !img.file) {
            console.log(`Skipping generation for history item ${i}`);
            continue;
          }

          setProcessingMessage(`Generando audio para imagen ${i + 1} de ${updatedImages.length}...`);

          let audioUrl = '';
          const cacheKey = audioMode === AudioGenerationMode.CLONE
            ? `CLONE-${selectedVoiceId}-${img.text}`
            : `GEMINI-${geminiVoiceName}-${img.text}`;

          if (currentCache.has(cacheKey)) {
            console.log(`Using cached audio for image ${i}`);
            audioUrl = currentCache.get(cacheKey)!;
          } else {
            if (audioMode === AudioGenerationMode.CLONE) {
              if (!selectedVoiceId) throw new Error("No voice selected.");
              const selectedVoice = clonedVoices.find(v => v.id === selectedVoiceId);
              if (!selectedVoice) throw new Error("Invalid voice.");
              // Note: Cloning might be slow.
              audioUrl = await generateClonedAudio(img.text, selectedVoice.sampleUrl);
            } else {
              // Gemini
              audioUrl = await geminiService.generateAudio(img.text, geminiVoiceName);
            }
            // Save to cache
            currentCache.set(cacheKey, audioUrl);
          }

          updatedImages[i] = { ...img, audioUrl };
        }

        setImages(updatedImages);

        // --- AUTO SAVE TO HISTORY ---
        setProcessingMessage('Guardando en historial...');
        const voiceUsedName = audioMode === AudioGenerationMode.CLONE
          ? clonedVoices.find(v => v.id === selectedVoiceId)?.name || 'Clonada'
          : geminiVoiceName;

        await Promise.all(updatedImages.map(async (img) => {
          if (img.saveToHistory && img.file && img.audioUrl) {
            try {
              // Convert dataURL to Blob for upload
              const audioBlob = await (await fetch(img.audioUrl)).blob();
              await saveAsset(img.file, audioBlob, img.text, voiceUsedName);
            } catch (err) {
              console.error("Failed to save asset to history:", err);
              // Don't block the user flow for this
            }
          }
        }));

      }

      setStep(AppStep.VIEW_RESULT);

    } catch (e) {
      console.error(e);
      setError(`Error al generar el anuncio: ${e instanceof Error ? e.message : String(e)}`);
      setStep(AppStep.GENERATE_AD);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleRestart = () => {
    setImages([]);
    // Reset specific states if needed, but maybe keep the selected voice preference?
    setGeneratedAudioUrl(null);
    setError(null);
    setIsProcessing(false);
    setProcessingMessage('');
    setStep(AppStep.UPLOAD_IMAGES);
  };

  const handleStepClick = (clickedStep: AppStep) => {
    if (clickedStep < step) {
      if (clickedStep === AppStep.UPLOAD_IMAGES) {
        handleRestart();
      } else {
        setStep(clickedStep);
      }
    }
  }

  const handleBack = () => {
    if (step > AppStep.UPLOAD_IMAGES) {
      setStep(prev => prev - 1);
    }
  }

  const renderCurrentStep = () => {
    switch (step) {
      case AppStep.UPLOAD_IMAGES:
        return (
          <Step1UploadImages
            onImagesUpload={handleImagesUpload}
            onAddAssetFromHistory={handleAddAssetFromHistory}
          />
        );
      case AppStep.EDIT_TEXT:
        return (
          <Step2EditText
            images={images}
            onTextChange={handleTextChange}
            onExtractText={handleExtractText}
            onRemoveImage={handleRemoveImage}
            onAddMoreImages={handleImagesUpload}
            onToggleSave={handleToggleSave}
            onReorderImages={handleReorderImages}
            onAddAssetFromHistory={handleAddAssetFromHistory}
            isProcessingText={isExtractingText}
            useOriginalAudio={useOriginalAudio}
            onToggleUseOriginalAudio={setUseOriginalAudio}
            onNext={handleNextFromEditText}
          />
        );
      case AppStep.SELECT_VOICE:
        return (
          <Step3SelectVoice
            voices={clonedVoices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoice={setSelectedVoiceId}
            onCloneVoice={handleCloneVoice}
            onAdvance={() => setStep(AppStep.GENERATE_AD)}
            onBack={handleBack}
            // New Props
            audioMode={audioMode}
            onSetAudioMode={setAudioMode}
            uploadedAdAudio={uploadedAdAudio}
            onSetUploadedAdAudio={setUploadedAdAudio}
            geminiVoiceName={geminiVoiceName}
            onSetGeminiVoiceName={setGeminiVoiceName}
          />
        );
      case AppStep.GENERATE_AD:
      case AppStep.GENERATING:
        return (
          <Step4GenerateAd
            onGenerateAd={handleGenerateAd}
            // Logic to determine if "Ready":
            isReady={
              allImagesHaveAudio || (
                images.length > 0 && (
                  (audioMode === AudioGenerationMode.CLONE && !!selectedVoiceId) ||
                  (audioMode === AudioGenerationMode.PRE_RECORDED && !!uploadedAdAudio) ||
                  (audioMode === AudioGenerationMode.GEMINI_TTS && !!geminiVoiceName)
                )
              )
            }
            isLoading={isProcessing && step === AppStep.GENERATING}
            loadingMessage={processingMessage}
          />
        );
      case AppStep.VIEW_RESULT:
        return (
          <Step5ViewResult
            images={images}
            audioUrl={generatedAudioUrl}
            onRestart={handleRestart}
            onEdit={() => setStep(AppStep.SELECT_VOICE)}
          />
        );
      default:
        return <Step1UploadImages onImagesUpload={handleImagesUpload} onAddAssetFromHistory={handleAddAssetFromHistory} />;
    }
  }

  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <Header />
      <main className="max-w-6xl mx-auto p-4 md:p-6 pb-24">
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
              <svg className="fill-current h-6 w-6 text-red-400" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
            </span>
          </div>
        )}

        {step < AppStep.GENERATING && <ProgressWizard currentStep={step} onStepClick={handleStepClick} />}

        {renderCurrentStep()}

      </main>
    </div>
  );
}