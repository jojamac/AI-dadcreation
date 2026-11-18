import React, { useRef, useState } from 'react';
import { Asset } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';

interface AssetPreviewModalProps {
    asset: Asset;
    onClose: () => void;
    onConfirm: () => void;
}

const AssetPreviewModal: React.FC<AssetPreviewModalProps> = ({ asset, onClose, onConfirm }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().catch(console.error);
            setIsPlaying(true);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-700 flex flex-col max-h-[90vh]">

                {/* HEADER */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Vista Previa del Historial</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition">✕</button>
                </div>

                {/* CONTENT (Scrollable) */}
                <div className="overflow-y-auto p-6 space-y-6">

                    {/* IMAGE */}
                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
                        <img src={asset.imageUrl} alt="Asset Preview" className="w-full h-full object-contain" />
                    </div>

                    {/* AUDIO PLAYER */}
                    <div className="bg-gray-700/50 p-4 rounded-xl flex items-center gap-4">
                        <button
                            onClick={togglePlay}
                            className="w-12 h-12 flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center shadow-lg transition-transform transform hover:scale-105"
                        >
                            {isPlaying ? <PauseIcon className="w-6 h-6 text-white" /> : <PlayIcon className="w-6 h-6 text-white ml-1" />}
                        </button>
                        <div className="flex-1">
                            <p className="text-xs text-indigo-300 font-bold uppercase mb-1">Voz: {asset.voiceName}</p>
                            <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
                                {/* Fake progress bar or just static */}
                                <div className={`h-full bg-indigo-400 ${isPlaying ? 'animate-pulse' : ''}`} style={{ width: '100%' }}></div>
                            </div>
                        </div>
                        <audio
                            ref={audioRef}
                            src={asset.audioUrl}
                            onEnded={() => setIsPlaying(false)}
                            onPause={() => setIsPlaying(false)}
                        />
                    </div>

                    {/* TEXT (Read Only) */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Guion del Anuncio</label>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-300 text-sm italic max-h-32 overflow-y-auto">
                            "{asset.text}"
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-right">Este texto no se puede editar.</p>
                    </div>

                </div>

                {/* FOOTER */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-800">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 transition">Cancelar</button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg hover:shadow-indigo-500/30 transition transform hover:-translate-y-0.5"
                    >
                        Añadir al Anuncio
                    </button>
                </div>

            </div>
        </div>
    );
};

export default AssetPreviewModal;
