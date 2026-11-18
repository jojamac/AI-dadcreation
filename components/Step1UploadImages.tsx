import React, { useRef, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import HistorySidebar from './HistorySidebar';
import AssetPreviewModal from './AssetPreviewModal';
import { Asset } from '../types';

interface Step1UploadImagesProps {
  onImagesUpload: (files: FileList) => void;
  onAddAssetFromHistory: (asset: Asset) => void;
}

const Step1UploadImages: React.FC<Step1UploadImagesProps> = ({ onImagesUpload, onAddAssetFromHistory }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImagesUpload(event.target.files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onImagesUpload(event.dataTransfer.files);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

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
    <div className="flex flex-col md:flex-row gap-6 h-[500px]">

      {/* SIDEBAR (History) */}
      <div className="w-full md:w-1/3 bg-gray-800 rounded-xl p-4 border border-gray-700 overflow-hidden">
        <HistorySidebar onSelectAsset={handleSelectAsset} />
      </div>

      {/* DROPZONE */}
      <div
        className="flex-1 bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center p-6 transition-all duration-300 hover:border-indigo-500 hover:bg-gray-800/50 cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <h2 className="text-xl font-semibold text-white mb-2">Paso 1: Sube tus Imágenes o Videos</h2>
        <p className="text-gray-400 mb-4 text-center">Arrastra imágenes o clips de video (.mp4, .webm) para unirlos en una sola secuencia.</p>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/png, image/jpeg, image/webp, video/mp4, video/webm, video/quicktime, video/x-m4v"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="bg-gray-700 p-4 rounded-full">
            <UploadIcon className="w-10 h-10 text-gray-400" />
          </div>
          <span className="text-indigo-400 font-semibold">Subir imágenes o videos</span>
          <span className="text-xs text-gray-500 text-center max-w-xs">
            Soporta fotos y videos. Puedes usar el audio original de los videos o reemplazarlos con voz IA.
          </span>
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

export default Step1UploadImages;
