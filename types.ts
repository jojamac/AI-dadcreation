
export type MediaType = 'image' | 'video';

export interface AdImage {
  id: string;
  file?: File;
  url: string;
  text: string;
  mediaType?: MediaType;
  duration?: number; // Video duration in seconds
  thumbnailUrl?: string; // Poster or preview thumbnail
  hasAudio?: boolean; // True if video has audio stream
  audioUrl?: string; // Generated or extracted audio for this specific item
  saveToHistory?: boolean;
  isFromHistory?: boolean;
}

export interface Asset {
  id: string;
  imageUrl: string;
  audioUrl: string;
  text: string;
  voiceName: string;
  createdAt: number;
  mediaType?: MediaType;
}

export interface ClonedVoice {
  id: string;
  name: string;
  sampleUrl: string; // URL to a sample of the voice
  isCustom?: boolean; // Flag to identify user-uploaded voices
}

export enum AppStep {
  UPLOAD_IMAGES,
  EDIT_TEXT,
  SELECT_VOICE,
  GENERATE_AD,
  GENERATING,
  VIEW_RESULT,
}

export enum AudioGenerationMode {
  CLONE = 'clone',
  PRE_RECORDED = 'pre_recorded',
  GEMINI_TTS = 'gemini_tts',
  ORIGINAL_VIDEO = 'original_video'
}
