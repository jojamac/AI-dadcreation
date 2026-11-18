
import React, { useRef, useState } from 'react';
import { AdImage, Asset } from '../types';
import { XCircleIcon } from './icons/XCircleIcon';
import { UploadIcon } from './icons/UploadIcon';
import Loader from './Loader';
import HistorySidebar from './HistorySidebar';
import AssetPreviewModal from './AssetPreviewModal';

interface Step2EditTextProps {
  images: AdImage[];
  onTextChange: (id: string, text: string) => void;
  onExtractText: () => void;
  onRemoveImage: (id: string) => void;
  onAddMoreImages: (files: FileList) => void;
  onToggleSave: (id: string, checked: boolean) => void;
  onReorderImages: (images: AdImage[]) => void;
  hasHistoryAsset: (asset: Asset) => void; // Actually we use onAddAssetFromHistory names in App
  onAddAssetFromHistory: (asset: Asset) => void;
  isProcessingText: boolean;
  onNext: () => void;
  useOriginalAudio?: boolean;
  onToggleUseOriginalAudio?: (val: boolean) => void;
}

const Step2EditText: React.FC<Step2EditTextProps> = ({
  images,
  onTextChange,
  onExtractText,
  onRemoveImage,
  onAddMoreImages,
  onToggleSave,
  onReorderImages,
  onAddAssetFromHistory,
  isProcessingText,
  onNext,
  useOriginalAudio = false,
  onToggleUseOriginalAudio
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasVideos = images.some(img => img.mediaType === 'video');
  const hasUnprocessedImages = images.some(img => !img.text);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // HISTORY MODAL STATE
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const handleNextClick = () => {
    // Si se opta por usar el audio original de los videos, saltamos la extracción de texto y vamos directo
    if (hasVideos && useOriginalAudio) {
      onNext();
      return;
    }

    if (hasUnprocessedImages) {
      onExtractText();
    } else {
      onNext();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onAddMoreImages(event.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDropFiles = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onAddMoreImages(event.dataTransfer.files);
    }
  };

  const handleDragOverFiles = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // --- CARD REORDERING ---
  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = sourceIndexStr ? parseInt(sourceIndexStr, 10) : draggedIndex;

    if (sourceIndex === null || sourceIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const newImages = [...images];
    const [movedItem] = newImages.splice(sourceIndex, 1);
    newImages.splice(targetIndex, 0, movedItem);

    onReorderImages(newImages);
    setDraggedIndex(null);
  };
  // -----------------------

  // HISTORY HANDLERS
  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
  };

  const handleConfirmAsset = () => {
    if (selectedAsset) {
      onAddAssetFromHistory(selectedAsset);
      setSelectedAsset(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* SIDEBAR (History) - Visible on Desktop */}
      <div className="w-full lg:w-1/4 bg-gray-800 rounded-xl p-4 border border-gray-700 overflow-hidden h-[600px] lg:sticky lg:top-4">
        <HistorySidebar onSelectAsset={handleSelectAsset} addedImageUrls={images.map(img => img.url)} />
      </div>

      {/* MAIN CONTENT */}
      <div className="w-full lg:w-3/4 bg-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-white flex items-center gap-3">
            Paso 2: Revisa el Contenido
            {images.length > 1 && (
              <span className="hidden sm:inline-flex items-center text-xs font-normal text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 animate-fadeIn">
                <span className="mr-2 text-lg leading-none">⇅</span> Arrastra para ordenar
              </span>
            )}
          </h2>
        </div>

        {/* BANNER INTELIGENTE PARA VIDEOS */}
        {hasVideos && (
          <div className="bg-indigo-950/60 border border-indigo-500/50 rounded-xl p-4 mb-6 shadow-lg shadow-indigo-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🎬</span>
              <h3 className="font-semibold text-white text-base">Se han detectado clips de video en tu secuencia</h3>
            </div>
            <p className="text-xs text-gray-300 mb-3">
              ¿Cómo deseas procesar el audio de los videos que subiste?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${useOriginalAudio ? 'bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400' : 'bg-gray-800/80 border-gray-700 hover:border-gray-500'}`}>
                <input
                  type="radio"
                  name="audioModeChoice"
                  checked={useOriginalAudio}
                  onChange={() => onToggleUseOriginalAudio?.(true)}
                  className="mt-1 text-indigo-600 accent-indigo-500"
                />
                <div>
                  <span className="font-bold text-white text-xs block">Usar audio original de los videos (Recomendado)</span>
                  <span className="text-[11px] text-gray-300">Concatena las escenas respetando el sonido, diálogos y duración de cada video sin pasar por voz IA.</span>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${!useOriginalAudio ? 'bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400' : 'bg-gray-800/80 border-gray-700 hover:border-gray-500'}`}>
                <input
                  type="radio"
                  name="audioModeChoice"
                  checked={!useOriginalAudio}
                  onChange={() => onToggleUseOriginalAudio?.(false)}
                  className="mt-1 text-indigo-600 accent-indigo-500"
                />
                <div>
                  <span className="font-bold text-white text-xs block">Silenciar y generar locución con IA</span>
                  <span className="text-[11px] text-gray-300">Permite escribir o extraer texto y generar una voz en off sintética o clonada encima de las escenas.</span>
                </div>
              </label>
            </div>
          </div>
        )}

        {!hasUnprocessedImages && images.length > 0 && (
          <p className="text-indigo-300 bg-indigo-500/10 p-3 rounded-md mb-4 text-sm">
            {images.length > 1
              ? "Todo listo. ¡Arrastra las tarjetas para reordenar la secuencia del video!"
              : (images[0].audioUrl
                ? "Todo listo. Imagen recuperada del historial (Texto bloqueado)."
                : "Todo listo. Revisa el texto y continúa.")}
          </p>
        )}
        <div className="space-y-4">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable={true}
              title={images.length > 1 ? "Arrastra para cambiar el orden" : undefined}
              onDragStart={(e) => handleCardDragStart(e, index)}
              onDragOver={handleCardDragOver}
              onDrop={(e) => handleCardDrop(e, index)}
              onDragEnd={() => setDraggedIndex(null)}
              className={`flex flex-col sm:flex-row gap-4 bg-gray-700/50 p-4 rounded-lg relative transition-all duration-200 cursor-move border border-transparent hover:border-indigo-500/50 ${draggedIndex === index ? 'opacity-40 border-indigo-500 border-dashed' : ''}`}
            >
              <button onClick={() => onRemoveImage(image.id)} className="absolute -top-2 -right-2 text-gray-400 hover:text-white transition-colors z-10">
                <XCircleIcon className="w-6 h-6" />
              </button>

              <div className="hidden sm:flex items-center justify-center text-gray-500 pr-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path></svg>
              </div>

              <div className="flex-shrink-0 flex flex-col gap-2 relative">
                <div className="relative w-full sm:w-48 h-48 rounded-md overflow-hidden bg-black flex items-center justify-center">
                  <img src={image.thumbnailUrl || image.url} alt="Ad preview" className="w-full h-full object-cover select-none pointer-events-none" />
                  {image.mediaType === 'video' && (
                    <span className="absolute top-2 left-2 bg-indigo-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow flex items-center gap-1">
                      🎬 Video {image.duration ? `(${image.duration.toFixed(1)}s)` : ''}
                    </span>
                  )}
                </div>
                {image.audioUrl ? (
                  <span className="text-[10px] bg-green-900 text-green-200 px-2 py-1 rounded text-center block border border-green-700">
                    Audio Reutilizado {image.isFromHistory ? "(Solo Lectura)" : "(Edita para regenerar)"}
                  </span>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer bg-gray-800 p-2 rounded border border-gray-600 hover:border-indigo-500 transition">
                    <input
                      type="checkbox"
                      className="rounded text-indigo-500 focus:ring-0"
                      checked={!!image.saveToHistory}
                      onChange={(e) => onToggleSave(image.id, e.target.checked)}
                    />
                    <span className="text-xs text-gray-300">Guardar en Historial</span>
                  </label>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">
                    {image.mediaType === 'video' ? `Escena ${index + 1} (Clip de Video)` : `Escena ${index + 1} (Imagen)`}
                  </span>
                  {hasVideos && useOriginalAudio && (
                    <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Audio original activo
                    </span>
                  )}
                </div>
                <textarea
                  value={image.text}
                  readOnly={!!image.isFromHistory || (hasVideos && useOriginalAudio)}
                  onChange={(e) => onTextChange(image.id, e.target.value)}
                  placeholder={hasVideos && useOriginalAudio 
                    ? "Usando el audio original del video (los subtítulos/guión IA están desactivados)..." 
                    : "El texto extraído aparecerá aquí o puedes escribirlo tú mismo..."}
                  className={`w-full min-h-[7rem] bg-gray-900 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition ${image.isFromHistory || (hasVideos && useOriginalAudio) ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-6 border-2 border-dashed border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDropFiles}
          onDragOver={handleDragOverFiles}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/png, image/jpeg, image/webp, video/mp4, video/webm, video/quicktime, video/x-m4v"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <UploadIcon className="w-6 h-6" />
            <span>Añadir más imágenes o videos</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700 flex justify-end items-center">
          <button
            onClick={handleNextClick}
            className="flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={images.length === 0 || isProcessingText}
          >
            {isProcessingText ? (
              <>
                <Loader />
                Extrayendo...
              </>
            ) : (
              hasVideos && useOriginalAudio
                ? 'Unir Videos y Continuar ➔'
                : (hasUnprocessedImages ? 'Extraer Texto' : 'Continuar')
            )}
          </button>
        </div>
      </div>

      {/* MODAL */}
      {selectedAsset && (
        <AssetPreviewModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onConfirm={handleConfirmAsset}
        />
      )}
    </div>
  );
};

export default Step2EditText;