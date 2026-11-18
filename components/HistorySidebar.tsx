import React, { useEffect, useState } from 'react';
import { Asset } from '../types';
import { getAssets, deleteAsset } from '../services/firebaseService';

interface HistorySidebarProps {
    onSelectAsset: (asset: Asset) => void;
    addedImageUrls?: string[];
}

const ITEMS_PER_PAGE = 5;

const HistorySidebar: React.FC<HistorySidebarProps> = ({ onSelectAsset, addedImageUrls = [] }) => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);

    // Search & Pagination State
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await getAssets();
                setAssets(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const handleDelete = async (e: React.MouseEvent, asset: Asset) => {
        e.stopPropagation();
        if (!window.confirm("¿Seguro que quieres eliminar este elemento del historial?")) return;

        try {
            await deleteAsset(asset.id, asset.imageUrl, asset.audioUrl);
            setAssets(prev => prev.filter(a => a.id !== asset.id));
        } catch (error) {
            alert("Error al eliminar.");
        }
    };

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Filtering
    const filteredAssets = assets.filter(asset => {
        const term = searchTerm.toLowerCase();
        const textMatch = (asset.text || '').toLowerCase().includes(term);
        const voiceMatch = (asset.voiceName || '').toLowerCase().includes(term);
        return textMatch || voiceMatch;
    });

    // Pagination Slicing
    const totalPages = Math.ceil(filteredAssets.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentAssets = filteredAssets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (loading) return <div className="p-4 text-center text-gray-500 text-xs">Cargando historial...</div>;

    return (
        <div className="h-full flex flex-col pr-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 sticky top-0 bg-gray-900 z-10 flex justify-between items-center">
                Tu Historial
                <span className="text-[9px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">{filteredAssets.length}</span>
            </h3>

            {/* SEARCH INPUT */}
            <div className="relative mb-4 group">
                <input
                    type="text"
                    placeholder="Buscar por texto o voz..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 text-gray-200 text-xs rounded-lg pl-8 pr-2 py-2.5 focus:bg-gray-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition outline-none placeholder-gray-600"
                />
                <svg className="w-4 h-4 text-gray-500 absolute left-2.5 top-2.5 group-focus-within:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {/* EMPTY STATE */}
            {filteredAssets.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500 text-xs italic">
                    {assets.length === 0 ? "No hay historial." : "No se encontraron resultados."}
                </div>
            )}

            {/* LIST */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-2 min-h-0">
                {currentAssets.map(asset => {
                    const isAdded = addedImageUrls.includes(asset.imageUrl);
                    return (
                        <div
                            key={asset.id}
                            onClick={() => !isAdded && onSelectAsset(asset)}
                            className={`flex gap-3 p-2 rounded-xl border transition-all duration-200 group
                                ${isAdded
                                    ? 'bg-gray-800/30 border-gray-700/30 opacity-60 cursor-default'
                                    : 'bg-gray-800/80 border-gray-700 hover:border-indigo-500/50 hover:bg-gray-800 hover:shadow-lg cursor-pointer'
                                }`}
                        >
                            {/* Thumbnail */}
                            <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 border border-gray-700 shadow-sm">
                                <img src={asset.imageUrl} alt="Asset" className="w-full h-full object-cover" />

                                {/* Delete Button */}
                                <button
                                    onClick={(e) => handleDelete(e, asset)}
                                    className="absolute top-1 left-1 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                    title="Eliminar del historial"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>

                                {isAdded && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                )}

                                {/* Audio Badge on Thumbnail */}
                                <div className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1 backdrop-blur-sm">
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M18 3a1 1 0 0 0-1.196-.98l-10 2A1 1 0 0 0 6 5v9.114A4.369 4.369 0 0 0 5 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0 0 15 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" /></svg>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <p className="text-xs text-gray-200 line-clamp-2 leading-relaxed mb-2 font-medium">
                                    {asset.text ? `"${asset.text}"` : <span className="text-gray-500 italic">Sin texto...</span>}
                                </p>

                                <div className="flex items-center justify-between mt-auto">
                                    <div className="flex items-center gap-1.5 bg-gray-900/50 px-2 py-1 rounded-full border border-gray-700/50">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                        <span className="text-[10px] text-gray-300 font-medium truncate max-w-[80px]">
                                            {asset.voiceName || 'Voz IA'}
                                        </span>
                                    </div>

                                    {!isAdded && (
                                        <span className="text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center gap-0.5">
                                            Usar &rarr;
                                        </span>
                                    )}
                                    {isAdded && (
                                        <span className="text-[10px] font-bold text-green-500 flex items-center gap-0.5 opacity-80">
                                            Agregado
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* PAGINATION CONTROLS */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-gray-800 bg-gray-900 sticky bottom-0 z-10 pb-2">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:hover:bg-gray-800 transition"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="text-[10px] text-gray-500 font-mono font-bold bg-black/20 px-3 py-1 rounded-full">
                        Pág {currentPage} de {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:hover:bg-gray-800 transition"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default HistorySidebar;
