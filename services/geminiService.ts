import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully.
  // For this environment, we assume API_KEY is set.
  console.warn("API_KEY environment variable not set.");
}

// Helper functions to handle raw PCM audio data
const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const encode = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

const pcmToWav = (pcmData: Uint8Array, sampleRate = 24000, channels = 1, bitDepth = 16): Uint8Array => {
  const pcmDataLength = pcmData.length;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const blockAlign = channels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmDataLength, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat for PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmDataLength, true);

  const wavBytes = new Uint8Array(44 + pcmData.length);
  wavBytes.set(new Uint8Array(wavHeader), 0);
  wavBytes.set(pcmData, 44);

  return wavBytes;
};


const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const extractTextFromImage = async (file: File): Promise<string> => {
  try {
    const imagePart = await fileToGenerativePart(file);

    // Key Rotation Logic
    const keys = [
      process.env.API_KEY,
      process.env.API_KEY_SECONDARY || "AIzaSyBStblgN_740qU2kWCabN89gIEta5Lvwtg",
      "AIzaSyDniT8pudqWWb_itXYCoVb8-SooK2PYJAg"
    ].filter(Boolean) as string[];

    let response;
    let lastError;

    for (const key of keys) {
      const currentAi = new GoogleGenAI({ apiKey: key });
      try {
        response = await currentAi.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: {
            parts: [
              { text: "Actúa como un locutor profesional. Tu tarea es analizar esta imagen y escribir el guion EXACTO que deberías leer en voz alta. REGLAS: 1) NO uses introducciones (como 'Aquí tienes el texto'). 2) NO uses markdown ni títulos. 3) Conecta la información de forma natural (ej: 'Te invitamos al gran evento en...', en lugar de solo leer 'Lugar: ...'). 4) Ignora logotipos irrelevantes. Solo devuelve el texto plano listo para ser hablado." },
              imagePart
            ]
          },
        });

        break; // Success

      } catch (e: any) {
        lastError = e;
        const isQuotaError =
          e.message?.includes('429') ||
          e.message?.includes('quota') ||
          e.status === 429 ||
          e.status === 'RESOURCE_EXHAUSTED' ||
          e.error?.code === 429 ||
          e?.response?.status === 429;

        if (isQuotaError) {
          console.warn(`Gemini API Quota Exceeded for key ending in ...${key?.slice(-4)}. Switching to next key...`);
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s before next try
          continue;
        } else {
          throw e; // Critical error
        }
      }
    }

    if (!response && lastError) throw lastError;

    if (!response?.text) {
      throw new Error("La respuesta de la API no contiene texto.");
    }
    return response.text;
  } catch (error) {
    console.error("Error extracting text from image:", error);
    throw new Error("No se pudo extraer el texto de la imagen.");
  }
};

export const generateAudio = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  try {
    // NOTE: This uses a pre-built voice. Voice cloning from an uploaded sample is not
    // a direct feature of this Gemini API endpoint. This simulates creating audio
    // with a selected voice style.

    // Retry logic with Key Rotation for 429 (Resource Exhausted)
    const keys = [
      process.env.API_KEY,
      process.env.API_KEY_SECONDARY || "AIzaSyBStblgN_740qU2kWCabN89gIEta5Lvwtg",
      "AIzaSyDniT8pudqWWb_itXYCoVb8-SooK2PYJAg"
    ].filter(Boolean) as string[];

    let response;
    let lastError;

    for (const key of keys) {
      // Create a fresh client for this key
      const currentAi = new GoogleGenAI({ apiKey: key });

      try {
        response = await currentAi.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
          },
        });

        // If successful, break the key loop
        break;

      } catch (e: any) {
        lastError = e;
        // Check for various quota error formats
        const isQuotaError =
          e.message?.includes('429') ||
          e.message?.includes('quota') ||
          e.status === 429 ||
          e.status === 'RESOURCE_EXHAUSTED' ||
          e.error?.code === 429 ||
          e?.response?.status === 429;

        if (isQuotaError) {
          console.warn(`Gemini API Quota Exceeded for key ending in ...${key?.slice(-4)}. Switching to next key...`);
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s before next try
          continue; // Try next key
        } else {
          throw e; // Other errors are fatal
        }
      }
    }

    if (!response && lastError) throw lastError;

    const base64Audio = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No se pudo generar el audio (respuesta vacía).");
    }

    // FIX: Convert raw PCM audio data to a WAV data URL to make it playable in an <audio> element.
    const pcmData = decode(base64Audio);
    const wavData = pcmToWav(pcmData);
    const wavBase64 = encode(wavData);

    return `data:audio/wav;base64,${wavBase64}`;
  } catch (error: any) {
    console.error("Error generating audio:", error);
    if (error.message?.includes('429') || error.status === 429) {
      throw new Error("El sistema está saturado (límite de cuota gratuito). Todas las claves API han sido agotadas. Por favor espera 1 minuto e intenta de nuevo.");
    }
    throw new Error(`No se pudo generar el audio: ${error.message}`);
  }
};