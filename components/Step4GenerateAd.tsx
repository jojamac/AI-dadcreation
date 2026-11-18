
import React from 'react';
import Loader from './Loader';
import { SparklesIcon } from './icons/SparklesIcon';

interface Step4GenerateAdProps {
  onGenerateAd: () => void;
  isReady: boolean;
  isLoading: boolean;
  loadingMessage: string;
}

const Step4GenerateAd: React.FC<Step4GenerateAdProps> = ({ onGenerateAd, isReady, isLoading, loadingMessage }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 text-center">
        <h2 className="text-xl font-semibold text-white mb-4">Generando tu Anuncio</h2>
        <div className="flex justify-center my-8">
            <Loader />
        </div>
        <p className="text-indigo-300 animate-pulse">{loadingMessage}</p>
        <p className="text-gray-400 text-sm mt-4">Este proceso puede tardar unos segundos. Por favor, no cierres esta ventana.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold text-white mb-2">Paso 4: Generar Anuncio</h2>
      <p className="text-gray-400 mb-6">
        Todo está listo. Haz clic en el botón de abajo para que la IA cree tu anuncio.
      </p>
      <button
        onClick={onGenerateAd}
        disabled={!isReady || isLoading}
        className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <SparklesIcon className="w-6 h-6" />
        {isLoading ? 'Generando...' : 'Crear Anuncio Ahora'}
      </button>
    </div>
  );
};

export default Step4GenerateAd;