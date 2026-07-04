import os
import sys
import tempfile
from fastapi import FastAPI, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import json

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

from backend.main import SubtitleRemover
from backend.config import config
import backend.config as cfg
import configparser
from backend.lipsync.sadtalker_inference import SadTalkerInference

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/remove-watermark")
async def remove_watermark(
    file: UploadFile,
    region: str = Form(...)  # JSON string: {"x":0, "y":0, "w":100, "h":100}
):
    region_data = json.loads(region)
    x = region_data['x']
    y = region_data['y']
    w = region_data['w']
    h = region_data['h']
    
    # SubtitleRemover expects (ymin, ymax, xmin, xmax)
    ymin = y
    ymax = y + h
    xmin = x
    xmax = x + w
    sub_areas = [(ymin, ymax, xmin, xmax)]
    
    # Save uploaded file
    fd, temp_input_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    
    with open(temp_input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    try:
        # We enforce english and propainter mode
        cfg.set(cfg.config.interface, 'en')
        cfg.config.inpaintMode.value = cfg.InpaintMode.PROPAINTER
        
        # Load translation strings so tr doesn't error out
        TRANSLATION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend', 'interface', f"en.ini")
        cfg.tr = configparser.ConfigParser()
        cfg.tr.read(TRANSLATION_FILE, encoding='utf-8')
        
        sr = SubtitleRemover(temp_input_path)
        sr.sub_areas = sub_areas
        
        # output file path
        output_path = temp_input_path.replace(".mp4", "_no_sub.mp4")
        sr.video_out_path = output_path
        
        print(f"Running VSR on {temp_input_path} with region {sub_areas}...")
        sr.run()
        print(f"Finished VSR, output at {output_path}")
        
        return FileResponse(
            path=output_path,
            media_type="video/mp4",
            filename=f"clean_{file.filename}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@app.post("/api/lipsync")
async def lipsync(
    background_tasks: BackgroundTasks,
    image: UploadFile,
    audio: UploadFile,
    still: bool = Form(True),
    enhance: bool = Form(False)
):
    # Save uploaded files to temp
    img_fd, temp_img_path = tempfile.mkstemp(suffix=".png")
    os.close(img_fd)
    with open(temp_img_path, "wb") as f:
        shutil.copyfileobj(image.file, f)
        
    aud_fd, temp_aud_path = tempfile.mkstemp(suffix=".wav")
    os.close(aud_fd)
    with open(temp_aud_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)
        
    out_fd, temp_out_path = tempfile.mkstemp(suffix="_lipsync.mp4")
    os.close(out_fd)
    
    # We clean up temp files in background tasks
    def cleanup_files(*paths):
        for path in paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception as e:
                print(f"Error cleaning up temp file {path}: {e}")
                
    background_tasks.add_task(cleanup_files, temp_img_path, temp_aud_path, temp_out_path)
    
    try:
        st = SadTalkerInference()
        
        # Verify if weights exist
        try:
            st.verify_models()
        except FileNotFoundError as fnf:
            return {
                "error": "missing_models",
                "message": str(fnf),
                "instructions": "Please download SadTalker checkpoints (SadTalker_V0.0.2_256.safetensors, mapping_00109-model.pth.tar, mapping_00229-model.pth.tar) and place them in the backend/backend/models/sadtalker/ directory."
            }
            
        print(f"Running SadTalker local inference (still={still}, enhance={enhance}) on {temp_img_path} with {temp_aud_path}...")
        st.generate_lipsync(
            image_path=temp_img_path,
            audio_path=temp_aud_path,
            output_path=temp_out_path,
            still=still,
            enhance=enhance
        )
        print(f"Finished SadTalker inference, output at {temp_out_path}")
        
        return FileResponse(
            path=temp_out_path,
            media_type="video/mp4",
            filename="lipsync.mp4"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Clean up files on crash
        cleanup_files(temp_img_path, temp_aud_path, temp_out_path)
        return {"error": str(e)}

