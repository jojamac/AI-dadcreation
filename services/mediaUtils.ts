import { AdImage } from '../types';

/**
 * Procesa un archivo (imagen o video) y extrae sus metadatos básicos,
 * duración y miniatura para la interfaz.
 */
export async function processMediaFile(file: File): Promise<AdImage> {
  const id = self.crypto.randomUUID();
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);
  const url = URL.createObjectURL(file);

  if (!isVideo) {
    return {
      id,
      file,
      url,
      mediaType: 'image',
      thumbnailUrl: url,
      text: '',
      isFromHistory: false,
    };
  }

  // Si es un video, cargamos metadatos en un elemento temporal
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    // Timeout de seguridad en caso de archivo corrupto o no soportado
    const timeout = setTimeout(() => {
      resolve({
        id,
        file,
        url,
        mediaType: 'video',
        thumbnailUrl: url,
        duration: 5,
        text: '',
        isFromHistory: false,
      });
    }, 5000);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
      
      // Mover el video al segundo 0.1 para capturar un fotograma que no sea negro
      video.currentTime = Math.min(0.2, duration / 2);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      let thumbnailUrl = url;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        }
      } catch (err) {
        console.warn('No se pudo generar miniatura del video:', err);
      }

      resolve({
        id,
        file,
        url,
        mediaType: 'video',
        thumbnailUrl,
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5,
        text: '',
        isFromHistory: false,
      });
    };

    video.onerror = () => {
      clearTimeout(timeout);
      resolve({
        id,
        file,
        url,
        mediaType: 'video',
        thumbnailUrl: url,
        duration: 5,
        text: '',
        isFromHistory: false,
      });
    };
  });
}
