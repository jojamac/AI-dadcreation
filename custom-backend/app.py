import gradio as gr
from TTS.api import TTS
import os

# Agree to Coqui terms
os.environ["COQUI_TOS_AGREED"] = "1"

# Load model (this will download ~2GB on first run)
# Using GPU if available, else CPU
device = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"
print(f"Loading XTTS model on {device}...")

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

def predict(prompt, language, audio_file_pth, mic_file_pth, use_mic, no_lang_auto_detect):
    # Logic to select the correct audio source
    speaker_wav = mic_file_pth if use_mic else audio_file_pth
    
    if not speaker_wav:
        raise gr.Error("Por favor sube un archivo de audio o usa el micrófono.")

    if not prompt:
        raise gr.Error("Por favor escribe el texto a generar.")

    # Generate audio
    # XTTS returns a file path to the generated wav
    # We clean up the previous file if needed, but Gradio handles temp files mostly.
    
    output_wav = tts.tts_to_file(
        text=prompt,
        file_path="output.wav",
        speaker_wav=speaker_wav,
        language=language
    )
    
    return "output.wav"

# Create Gradio Interface
# We match the signature typically expected or create a simple one
demo = gr.Interface(
    fn=predict,
    inputs=[
        gr.Textbox(label="Texto a generar", value="Hola, esto es una prueba de clonación de voz."),
        gr.Dropdown(label="Idioma", choices=["es", "en", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "ko", "hu"], value="es"),
        gr.Audio(label="Subir voz (Referencia)", type="filepath"),
        gr.Audio(label="Usar Micrófono", source="microphone", type="filepath"),
        gr.Checkbox(label="Usar Micrófono en lugar de archivo", value=False),
        gr.Checkbox(label="Desactivar detección idioma", value=False),
    ],
    outputs=[
        gr.Audio(label="Audio Generado"),
    ],
    title="Mi Clonador de Voz (XTTS v2)",
    description="Generador de voz privado. Sube una muestra de 10-20 segundos y escribe el texto."
)

if __name__ == "__main__":
    demo.queue().launch()
