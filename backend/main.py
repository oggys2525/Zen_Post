from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from urllib.parse import quote, urlparse
import glob
import hashlib
import os
import shutil
import subprocess
import uvicorn

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

class VideoExtractRequest(BaseModel):
    url: str

class PostSchedule(BaseModel):
    video_url: Optional[str] = ""
    account: str
    page: str
    caption: str
    scheduled_time: str

POST_DB = []

def validate_http_url(url):
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must start with http:// or https://")
    return url.strip()

def safe_video_id(url):
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]

def build_public_url(request, filename):
    return f"{str(request.base_url).rstrip('/')}/downloads/{quote(filename)}"

def find_downloaded_file(output_template):
    base = output_template.split(".%(", 1)[0]
    candidates = [
        path
        for path in glob.glob(f"{base}.*")
        if os.path.isfile(path) and not path.endswith((".part", ".ytdl"))
    ]

    if not candidates:
        raise RuntimeError("Downloaded video file was not found.")

    return sorted(candidates, key=os.path.getmtime)[-1]

def clear_existing_downloads(output_template):
    base = output_template.split(".%(", 1)[0]
    for path in glob.glob(f"{base}.*"):
        if os.path.isfile(path):
            os.remove(path)

def transcode_audio_to_aac(file_path):
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    temp_path = f"{file_path}.aac.mp4"
    command = [
        ffmpeg_exe,
        "-y",
        "-i",
        file_path,
        "-map",
        "0:v?",
        "-map",
        "0:a?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        temp_path,
    ]
    subprocess.run(command, check=True)
    os.replace(temp_path, file_path)

def download_video_file(url, directory, output_template):
    try:
        import yt_dlp
    except ImportError as error:
        raise RuntimeError("yt-dlp is not installed. Run: pip install -r requirements.txt") from error

    try:
        import imageio_ffmpeg
        ffmpeg_location = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg_location = None

    clear_existing_downloads(output_template)

    ydl_opts = {
        "format": "bestvideo[ext=mp4][vcodec!=vp9][vcodec!=av01]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/bestvideo+bestaudio/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "postprocessor_args": {
            "ffmpeg": ["-c:a", "aac"],
        },
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
    }

    if ffmpeg_location:
        ydl_opts["ffmpeg_location"] = ffmpeg_location

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if not info:
        raise RuntimeError("No video information was returned.")

    file_path = find_downloaded_file(output_template)
    transcode_audio_to_aac(file_path)
    return info, file_path

@app.post("/extract-video")
async def extract_video(body: VideoExtractRequest, request: Request):
    try:
        url = validate_http_url(body.url)
        video_id = safe_video_id(url)
        output_template = os.path.join(DOWNLOAD_DIR, f"{video_id}.%(ext)s")
        info, file_path = download_video_file(url, DOWNLOAD_DIR, output_template)
        filename = os.path.basename(file_path)

        description = (info.get("description") or "").strip()
        caption = description or (info.get("title") or "")

        return {
            "success": True,
            "video_url": build_public_url(request, filename),
            "title": info.get("title") or filename,
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "platform": info.get("extractor_key"),
            "caption": caption[:2000],
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Could not extract video: {error}") from error

@app.post("/upload")
async def upload_video(
    video: Optional[UploadFile] = File(None),
    video_url: Optional[str] = Form(None),
    account: str = Form(...),
    page: str = Form(...),
    caption: str = Form(...),
):
    video_path = None

    if video:
        safe_filename = os.path.basename(video.filename or "video.mp4")
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        video_path = file_path
    elif video_url:
        try:
            url = validate_http_url(video_url)
            video_id = safe_video_id(url)
            output_template = os.path.join(UPLOAD_DIR, f"{video_id}.%(ext)s")
            _, file_path = download_video_file(url, UPLOAD_DIR, output_template)
            video_path = file_path
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"Could not download video from URL: {error}") from error

    post_data = {
        "video_path": video_path,
        "video_url": video_url or "",
        "account": account,
        "page": page,
        "caption": caption,
        "status": "uploaded",
        "created_at": datetime.now().isoformat(),
    }
    POST_DB.append(post_data)
    return {"message": "Video uploaded successfully", "data": post_data}

@app.post("/schedule")
def schedule_post(post: PostSchedule):
    post_data = {
        "video_url": post.video_url or "",
        "account": post.account,
        "page": post.page,
        "caption": post.caption,
        "scheduled_time": post.scheduled_time,
        "status": "scheduled",
        "created_at": datetime.now().isoformat(),
    }
    POST_DB.append(post_data)
    return {"message": "Post scheduled successfully", "data": post_data}

@app.get("/posts")
def get_posts():
    return POST_DB

@app.get("/")
def root():
    return {"message": "Zen Post App API is running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
