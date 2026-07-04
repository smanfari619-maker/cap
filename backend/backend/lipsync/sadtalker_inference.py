import os
import subprocess
import sys
import shutil
import tempfile

class SadTalkerInference:
    def __init__(self):
        # Base paths relative to the cap/backend directory
        self.backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.sadtalker_dir = os.path.join(self.backend_dir, "backend", "lipsync", "sadtalker")
        self.checkpoint_dir = os.path.join(self.backend_dir, "backend", "models", "sadtalker")
        
        # Verify essential weights exist
        self.required_files = [
            "SadTalker_V0.0.2_256.safetensors",
            "mapping_00109-model.pth.tar",
            "mapping_00229-model.pth.tar"
        ]

    def verify_models(self):
        """Check if required models are in the models folder."""
        missing = []
        for f in self.required_files:
            path = os.path.join(self.checkpoint_dir, f)
            if not os.path.exists(path):
                missing.append(path)
        if missing:
            raise FileNotFoundError(
                f"SadTalker model weights not found at {self.checkpoint_dir}. "
                f"Missing files: {[os.path.basename(m) for m in missing]}. "
                "Please download the weights before running inference."
            )

    def generate_lipsync(self, image_path, audio_path, output_path, still=True, enhance=False):
        """Run SadTalker 3D Talking avatar generator via subprocess."""
        self.verify_models()
        
        image_path = os.path.abspath(image_path)
        audio_path = os.path.abspath(audio_path)
        output_path = os.path.abspath(output_path)

        
        # Setup temporary directories for SadTalker execution
        temp_result_dir = tempfile.mkdtemp()
        
        try:
            # Construct python CLI command
            python_executable = sys.executable  # Use current venv python
            sadtalker_script = os.path.join(self.sadtalker_dir, "inference.py")
            
            cmd = [
                python_executable,
                sadtalker_script,
                "--source_image", image_path,
                "--driven_audio", audio_path,
                "--checkpoint_dir", self.checkpoint_dir,
                "--result_dir", temp_result_dir,
                "--preprocess", "extfull",
                "--size", "256"
            ]
            
            if still:
                cmd.append("--still")
                
            if enhance:
                cmd.extend(["--enhancer", "gfpgan"])
                
            print(f"Running SadTalker subprocess command: {' '.join(cmd)}")
            
            # Execute subprocess with PYTHONPATH set to include sadtalker directory
            # because SadTalker imports local files from its root directory (e.g. import src)
            env = os.environ.copy()
            env["PYTHONPATH"] = f"{self.sadtalker_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"
            
            result = subprocess.run(
                cmd,
                cwd=self.sadtalker_dir,  # Run in sadtalker dir context
                env=env,
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print(f"SadTalker failed with stderr: {result.stderr}")
                print(f"SadTalker stdout: {result.stdout}")
                raise RuntimeError(f"SadTalker generation failed: {result.stderr or result.stdout}")
                
            # SadTalker saves results in: temp_result_dir/<timestamp>.mp4 (or similar subfolders)
            # Find any generated mp4 in temp_result_dir
            generated_mp4s = []
            for root, dirs, files in os.walk(temp_result_dir):
                for f in files:
                    if f.endswith(".mp4"):
                        generated_mp4s.append(os.path.join(root, f))
                        
            if not generated_mp4s:
                raise FileNotFoundError("SadTalker completed but no output .mp4 video file was found.")
                
            # Use the first found generated mp4
            src_video = generated_mp4s[0]
            shutil.copy2(src_video, output_path)
            print(f"SadTalker output successfully copied from {src_video} to {output_path}")
            
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_result_dir, ignore_errors=True)
