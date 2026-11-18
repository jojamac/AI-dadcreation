import os
import torch
from openvoice import se_extractor
from openvoice.api import BaseSpeakerTTS, ToneColorConverter
import gradio as gr

# Setup paths and device
device = "cuda:0" if torch.cuda.is_available() else "cpu"
output_dir = 'outputs'
os.makedirs(output_dir, exist_ok=True)

# Load Models (This assumes you have downloaded checkpoints to a 'checkpoints' folder in the space)
# For a real HF space, you might need to auto-download them on startup if not present.
ckpt_base = 'checkpoints/base_speakers/EN' # Example base
ckpt_converter = 'checkpoints/converter'

# Initialize Tone Color Converter
tone_color_converter = ToneColorConverter(f'{ckpt_converter}/config.json', device=device)
tone_color_converter.load_ckpt(f'{ckpt_converter}/checkpoint.pth')

# Initialize Base Speaker (MeloTTS usually for V2)
# Simplified for demo: assuming standard EN base
base_speaker_tts = BaseSpeakerTTS(f'{ckpt_base}/config.json', device=device)
base_speaker_tts.load_ckpt(f'{ckpt_base}/checkpoint.pth')

def clone_voice(text, ref_audio, language="English"):
    # 1. Extract Tone Color from Reference Audio
    # This is the "cloning" part
    target_se, audio_name = se_extractor.get_se(ref_audio, tone_color_converter, target_dir='processed_se')
    
    # 2. Generate Base Audio (Generic Robot Voice with correct intonation)
    # OpenVoice separates content generation from tone.
    src_path = f'{output_dir}/tmp.wav'
    
    # NOTE: BaseSpeakerTTS in OpenVoice V2 often relies on MeloTTS. 
    # This call signature might vary depending on the exact version installed.
    base_speaker_tts.tts(text, src_path, speaker='default', language=language, speed=1.0)

    # 3. Apply Tone Color (The Magic)
    save_path = f'{output_dir}/output_openvoice.wav'
    tone_color_converter.convert(
        audio_src_path=src_path, 
        src_se=base_speaker_tts.default_se, # Source embedding of the base speaker
        tgt_se=target_se, # Target embedding of your pastor
        output_path=save_path,
        message='@MyOpenVoice' # Watermark (optional)
    )

    return save_path

# Gradio Interface
app = gr.Interface(
    fn=clone_voice,
    inputs=[
        gr.Textbox(label="Texto"),
        gr.Audio(type="filepath", label="Audio Referencia (Pastor)"),
        gr.Dropdown(choices=["English", "Spanish"], label="Idioma", value="Spanish")
    ],
    outputs=gr.Audio(label="Audio Clonado"),
    title="OpenVoice V2 Cloner"
)

app.launch()
