import { Client } from "@gradio/client";
import { HfInference } from "@huggingface/inference";

// We use the token from env vars for authentication if needed
// Note: Client.connect passes hf_token as an option.
const HF_TOKEN = import.meta.env.VITE_HUGGING_FACE_TOKEN;

const hf = new HfInference(HF_TOKEN);

// Fallback standard TTS model (fast, reliable, no cloning)
const FALLBACK_MODEL = "facebook/mms-tts-spa";

export const generateAudio = async (text: string, voiceSampleUrl?: string): Promise<string> => {
    // If we have a voice sample, we try to clone using the Coqui XTTS-v2 Space.
    if (voiceSampleUrl) {
        console.log("HuggingFace: Attempting voice cloning via Coqui XTTS-v2 Space with URL:", voiceSampleUrl);

        try {
            // 1. Connect to the Space
            let app;
            try {
                if (HF_TOKEN) {
                    app = await Client.connect("coqui/XTTS-v2", { hf_token: HF_TOKEN } as any);
                } else {
                    throw new Error("No token provided");
                }
            } catch (e) {
                // Fallback: Try anonymous connection to an alternative active mirror
                // users report coqui/XTTS-v2 is down/broken.
                // trying 'surn/XTTS-v2' or 'badrodz/XTTS-v2-ZeroShot-Voice-Cloning'
                app = await Client.connect("surn/XTTS-v2");
            }

            // 2. Predict / Generate
            // We pass the URL directly. The Gradio server should handle fetching it.
            // [Prompt, Language, Ref Audio, Mic Audio, Use Mic, Cleanup, No Filter, Terms]
            const result = await app.predict("/predict", [
                text,           // Prompt
                "es",           // Language
                voiceSampleUrl, // Reference Audio (URL string)
                null,           // Microphone Audio
                false,          // Use Microphone
                false,          // Cleanup
                false,          // Do not filter
                true,           // Agree to terms
            ]);

            // The result is typically { data: [ "Success", { url: "..." }, ... ] }
            // OR [ AudioPath, Text, ... ]
            // Based on coqui/XTTS-v2 api, data[0] is often the audio.
            console.log("HuggingFace Cloning Result Full Object:", result);

            // Let's try to find the audio in the first few elements
            // We expect an object with 'url' or a string path ending in .wav
            // Try data[1] first (old logic) but fallback to data[0] if valid
            let audioResult = (result as any).data[1];
            const potentialAudio0 = (result as any).data[0];

            if (potentialAudio0 && (potentialAudio0.url || (typeof potentialAudio0 === 'string' && potentialAudio0.endsWith('.wav')))) {
                audioResult = potentialAudio0;
            }

            // Check if we found something valid
            let finalUrl = "";
            if (audioResult) {
                if (audioResult.url) finalUrl = audioResult.url;
                else if (typeof audioResult === 'string') finalUrl = audioResult;
            }

            if (finalUrl) {
                // FORCE: Fetch the result URL server-side (or via proxy) to avoid CORS issues on the client <audio> tag.
                // Since we are client-side, we fetch it. Be aware HF spaces might block "no-cors" fetch.
                // Actually, Gradio usually returns a URL that is accessible if the space is public.
                // If it fails, we fall back.

                try {
                    const audioResponse = await fetch(finalUrl);
                    const audioBlob = await audioResponse.blob();
                    return URL.createObjectURL(audioBlob);
                } catch (fetchError) {
                    console.warn("Could not fetch remote audio blob, returning direct URL (might fail CORS).", fetchError);
                    return finalUrl;
                }
            }

            console.warn("Cloning result structure unexpected:", result);
            // If we don't get a URL, throw to fallback.
            throw new Error("Cloning output format invalid.");

        } catch (error) {
            console.error("Cloning failed:", error);
            // Throw explicit error so UI shows it to the user.
            throw new Error(`Error clonando voz: ${error instanceof Error ? error.message : "Servicio no disponible"}. Por favor use una Voz Estándar por ahora.`);
        }
    }

    // Fallback: Standard TTS (No Cloning)
    // This is much faster and reliable for "Generic" Spanish.
    try {
        console.log("HuggingFace: Generating standard TTS...");
        const blob = await hf.textToSpeech({
            model: FALLBACK_MODEL,
            inputs: text,
        });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Standard TTS failed:", e);
        throw new Error("No se pudo generar el audio.");
    }
};
