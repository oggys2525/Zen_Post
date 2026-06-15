from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from urllib.parse import quote, urlparse
import glob
import hashlib
import json
import os
import shutil
import subprocess
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Content-Type-Options", "Cache-Control"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers.setdefault("Cache-Control", "public, max-age=60, stale-while-revalidate=30")
    return response

@app.options("/{full_path:path}")
async def preflight_handler(request: Request, full_path: str):
    from fastapi.responses import JSONResponse
    response = JSONResponse(content={}, status_code=200)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers.setdefault("Cache-Control", "public, max-age=60, stale-while-revalidate=30")
    return response

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
THUMBNAIL_DIR = os.path.join(BASE_DIR, "thumbnails")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")
app.mount("/thumbnails", StaticFiles(directory=THUMBNAIL_DIR), name="thumbnails")

class VideoExtractRequest(BaseModel):
    url: str

class FilePathRequest(BaseModel):
    file_path: str

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

def generate_video_thumbnails(video_path, count=4):
    try:
        import imageio_ffmpeg
        import cv2
    except ImportError:
        raise RuntimeError("opencv-python is required for thumbnail generation. Run: pip install opencv-python")

    if not os.path.isfile(video_path):
        raise RuntimeError("Video file was not found for thumbnail generation.")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open video for thumbnail generation.")

    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    duration = frame_count / fps if fps > 0 else 0

    if duration <= 0:
        cap.release()
        raise RuntimeError("Could not determine video duration.")

    interval = duration / (count + 1)
    thumbnail_paths = []
    video_id = safe_video_id(video_path)

    for index in range(1, count + 1):
        timestamp = interval * index
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        success, frame = cap.read()
        if not success:
            continue

        thumbnail_filename = f"{video_id}_thumb_{index}.jpg"
        thumbnail_path = os.path.join(THUMBNAIL_DIR, thumbnail_filename)
        cv2.imwrite(thumbnail_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        thumbnail_paths.append(thumbnail_filename)

    cap.release()

    if not thumbnail_paths:
        raise RuntimeError("Could not generate thumbnails from video.")

    return thumbnail_paths

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

        try:
            thumbnail_filenames = generate_video_thumbnails(file_path)
            thumbnail_urls = [f"{str(request.base_url).rstrip('/')}/thumbnails/{quote(name)}" for name in thumbnail_filenames]
        except Exception:
            thumbnail_urls = []

        return {
            "success": True,
            "video_url": build_public_url(request, filename),
            "title": info.get("title") or filename,
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "platform": info.get("extractor_key"),
            "caption": caption[:2000],
            "thumbnails": thumbnail_urls,
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

    try:
        thumbnail_filenames = generate_video_thumbnails(video_path)
        thumbnail_urls = [f"/thumbnails/{quote(name)}" for name in thumbnail_filenames]
    except Exception:
        thumbnail_urls = []

    return {"message": "Video uploaded successfully", "data": post_data, "thumbnails": thumbnail_urls}

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
