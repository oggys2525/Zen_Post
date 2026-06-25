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

class MediaDownloadRequest(BaseModel):
    url: str
    format: str # 'mp3' or 'mp4'
    save_folder: Optional[str] = ""

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

def is_audio_aac(file_path):
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        result = subprocess.run(
            [ffmpeg_exe, "-i", file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        info = result.stderr or result.stdout
        return "Audio: aac" in info
    except Exception:
        return False

def transcode_audio_to_aac(file_path):
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    temp_path = f"{file_path}.aac.mp4"
    
    if is_audio_aac(file_path):
        # Already AAC. Just copy streams and add faststart (instant)
        command = [
            ffmpeg_exe,
            "-y",
            "-i",
            file_path,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            temp_path,
        ]
    else:
        # Not AAC. Transcode audio to AAC
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

def download_video_file(url, directory, output_template, progress_hook=None):
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
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
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
        "concurrent_fragment_downloads": 8,
    }

    if ffmpeg_location:
        ydl_opts["ffmpeg_location"] = ffmpeg_location

    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]

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

import uuid
import threading
import time
import requests

DB_POSTS_FILE = os.path.join(BASE_DIR, "posts_db.json")
DB_FB_FILE = os.path.join(BASE_DIR, "fb_config.json")

def load_posts():
    if not os.path.exists(DB_POSTS_FILE):
        return []
    try:
        with open(DB_POSTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_posts(posts):
    try:
        with open(DB_POSTS_FILE, "w", encoding="utf-8") as f:
            json.dump(posts, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("Error saving posts:", e)

def load_fb_config():
    defaults = {
        "user_access_token": "",
        "user_name": "",
        "user_id": "",
        "pages": [],
        "app_id": "",
        "app_secret": ""
    }
    if not os.path.exists(DB_FB_FILE):
        return defaults
    try:
        with open(DB_FB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Ensure all default keys exist
            for k, v in defaults.items():
                if k not in data:
                    data[k] = v
            return data
    except Exception:
        return defaults

def save_fb_config(config):
    try:
        # Keep existing app credentials if not provided in saved config
        existing = load_fb_config()
        if "app_id" not in config:
            config["app_id"] = existing.get("app_id", "")
        if "app_secret" not in config:
            config["app_secret"] = existing.get("app_secret", "")
        with open(DB_FB_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("Error saving FB config:", e)

def publish_post_async(post_id: str):
    posts = load_posts()
    post_index = next((i for i, p in enumerate(posts) if p.get("id") == post_id), -1)
    if post_index == -1:
        return
        
    post = posts[post_index]
    fb_config = load_fb_config()
    page_id = post.get("fb_page_id")
    page_name = post.get("fb_page_name") or "Selected Page"
    
    # Find page access token
    pages = fb_config.get("pages") or []
    page_access_token = None
    for p in pages:
        if str(p.get("id")) == str(page_id):
            page_access_token = p.get("access_token")
            break
            
    if not page_access_token:
        # Fallback to general user access token if page access token is not separate
        page_access_token = fb_config.get("user_access_token")
        
    is_mock = False
    if page_access_token and ("MOCK" in str(page_access_token) or str(page_access_token).startswith("EAAGzD123")):
        is_mock = True
    elif not page_access_token:
        is_mock = True
        
    if str(page_id).startswith("page_") or str(page_id) in ["12048593028374", "14058294029485", "16058295029486"]:
        is_mock = True

    video_path = post.get("video_path")
    
    # Download video if not already present but video_url is
    if (not video_path or not os.path.exists(video_path)) and post.get("video_url"):
        try:
            url = validate_http_url(post.get("video_url"))
            video_id = safe_video_id(url)
            output_template = os.path.join(DOWNLOAD_DIR, f"{video_id}.%(ext)s")
            _, file_path = download_video_file(url, DOWNLOAD_DIR, output_template)
            video_path = file_path
            post["video_path"] = video_path
            save_posts(posts)
        except Exception as dl_err:
            post["status"] = "failed"
            post["error_message"] = f"Download failed: {dl_err}"
            post["published_at"] = datetime.now().isoformat()
            save_posts(posts)
            return

    if not video_path or not os.path.exists(video_path):
        post["status"] = "failed"
        post["error_message"] = f"Video file not found at {video_path}"
        post["published_at"] = datetime.now().isoformat()
        save_posts(posts)
        return
        
    # Start Facebook video upload (Simulated or Real)
    try:
        if is_mock:
            import time
            import random
            time.sleep(2.5)  # Simulate network upload delay
            fb_post_id = f"fb_post_{random.randint(100000000000, 999999999999)}"
            post["status"] = "published"
            post["fb_post_id"] = fb_post_id
            post["error_message"] = ""
            post["published_at"] = datetime.now().isoformat()
            print(f"Simulated upload success: Post {post_id} published to Facebook page {page_name} (ID: {page_id})")
        else:
            url = f"https://graph.facebook.com/v20.0/{page_id}/videos"
            payload = {
                'access_token': page_access_token,
                'description': post.get("caption") or ""
            }
            
            with open(video_path, 'rb') as f:
                files = {
                    'source': f
                }
                response = requests.post(url, data=payload, files=files, timeout=600)
                
            result = response.json()
            if response.status_code != 200 or 'error' in result:
                error_details = result.get('error', {})
                error_msg = error_details.get('message', 'Unknown Facebook API error')
                raise Exception(f"Facebook Graph API Error: {error_msg} (code: {error_details.get('code')})")
                
            fb_post_id = result.get('id') or result.get('post_id')
            
            post["status"] = "published"
            post["fb_post_id"] = fb_post_id
            post["error_message"] = ""
            post["published_at"] = datetime.now().isoformat()
            print(f"Post {post_id} published successfully to page {page_name}!")
    except Exception as ex:
        post["status"] = "failed"
        post["error_message"] = str(ex)
        post["published_at"] = datetime.now().isoformat()
        print(f"Post {post_id} failed to publish: {ex}")
        
    save_posts(posts)

def background_scheduler():
    while True:
        try:
            posts = load_posts()
            for post in posts:
                if post.get("status") == "scheduled":
                    sched_time_str = post.get("scheduled_time")
                    if sched_time_str:
                        try:
                            # Scheduled time is formatted as YYYY-MM-DDTHH:MM
                            sched_time = datetime.fromisoformat(sched_time_str)
                            if datetime.now() >= sched_time:
                                post["status"] = "processing"
                                save_posts(posts)
                                
                                # Run publish async so we don't block
                                pub_thread = threading.Thread(target=publish_post_async, args=(post.get("id"),))
                                pub_thread.daemon = True
                                pub_thread.start()
                        except Exception as parse_err:
                            post["status"] = "failed"
                            post["error_message"] = f"Invalid scheduled time format: {parse_err}"
                            save_posts(posts)
        except Exception as err:
            print("Error in background scheduler:", err)
        time.sleep(10)

# Start scheduler thread
scheduler_thread = threading.Thread(target=background_scheduler)
scheduler_thread.daemon = True
scheduler_thread.start()

class ConnectRequest(BaseModel):
    accessToken: str

class CreatePostRequest(BaseModel):
    video_url: Optional[str] = ""
    video_path: Optional[str] = ""
    caption: str
    fb_page_id: str
    fb_page_name: str
    scheduled_time: Optional[str] = ""
    thumbnail_url: Optional[str] = ""

@app.post("/upload")
async def upload_video(
    video: Optional[UploadFile] = File(None),
    video_url: Optional[str] = Form(None),
    account: str = Form(...),
    page: str = Form(...),
    caption: str = Form(...),
    scheduled_time: Optional[str] = Form(None),
    thumbnail: Optional[str] = Form(None),
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

    post_id = str(uuid.uuid4())[:8]
    status = "scheduled" if scheduled_time else "processing"

    # Try mapping page to names if possible
    fb_config = load_fb_config()
    page_name = page
    for p in fb_config.get("pages", []):
        if str(p.get("id")) == str(page):
            page_name = p.get("name")
            break

    post_data = {
        "id": post_id,
        "video_path": video_path or "",
        "video_url": video_url or "",
        "caption": caption,
        "fb_page_id": page,
        "fb_page_name": page_name,
        "scheduled_time": scheduled_time or "",
        "thumbnail_url": thumbnail or "",
        "status": status,
        "error_message": "",
        "fb_post_id": "",
        "created_at": datetime.now().isoformat(),
        "published_at": "",
    }
    
    posts = load_posts()
    posts.append(post_data)
    save_posts(posts)

    if status == "processing":
        pub_thread = threading.Thread(target=publish_post_async, args=(post_id,))
        pub_thread.daemon = True
        pub_thread.start()

    try:
        thumbnail_filenames = generate_video_thumbnails(video_path)
        thumbnail_urls = [f"/thumbnails/{quote(name)}" for name in thumbnail_filenames]
    except Exception:
        thumbnail_urls = []

    return {"message": "Video processed successfully", "data": post_data, "thumbnails": thumbnail_urls}

@app.post("/schedule")
def schedule_post(post: PostSchedule):
    post_id = str(uuid.uuid4())[:8]
    status = "scheduled" if post.scheduled_time else "processing"
    
    fb_config = load_fb_config()
    page_name = post.page
    for p in fb_config.get("pages", []):
        if str(p.get("id")) == str(post.page):
            page_name = p.get("name")
            break

    post_data = {
        "id": post_id,
        "video_path": "",
        "video_url": post.video_url or "",
        "caption": post.caption,
        "fb_page_id": post.page,
        "fb_page_name": page_name,
        "scheduled_time": post.scheduled_time or "",
        "thumbnail_url": "",
        "status": status,
        "error_message": "",
        "fb_post_id": "",
        "created_at": datetime.now().isoformat(),
        "published_at": "",
    }
    
    posts = load_posts()
    posts.append(post_data)
    save_posts(posts)

    if status == "processing":
        pub_thread = threading.Thread(target=publish_post_async, args=(post_id,))
        pub_thread.daemon = True
        pub_thread.start()

    return {"message": "Post scheduled successfully", "data": post_data}

@app.get("/posts")
def get_posts():
    return load_posts()

@app.post("/api/posts")
def create_post(body: CreatePostRequest):
    posts = load_posts()
    status = "scheduled" if body.scheduled_time else "processing"
    post_id = str(uuid.uuid4())[:8]
    
    new_post = {
        "id": post_id,
        "video_url": body.video_url or "",
        "video_path": body.video_path or "",
        "caption": body.caption,
        "fb_page_id": body.fb_page_id,
        "fb_page_name": body.fb_page_name,
        "scheduled_time": body.scheduled_time or "",
        "thumbnail_url": body.thumbnail_url or "",
        "status": status,
        "error_message": "",
        "fb_post_id": "",
        "created_at": datetime.now().isoformat(),
        "published_at": ""
    }
    
    posts.append(new_post)
    save_posts(posts)
    
    if status == "processing":
        pub_thread = threading.Thread(target=publish_post_async, args=(post_id,))
        pub_thread.daemon = True
        pub_thread.start()
        
    return {"success": True, "post": new_post}

@app.put("/api/posts/{post_id}")
def update_post(post_id: str, body: CreatePostRequest):
    posts = load_posts()
    post_index = next((i for i, p in enumerate(posts) if p.get("id") == post_id), -1)
    if post_index == -1:
        raise HTTPException(status_code=404, detail="Post not found")
        
    post = posts[post_index]
    post["caption"] = body.caption
    post["fb_page_id"] = body.fb_page_id
    post["fb_page_name"] = body.fb_page_name
    post["scheduled_time"] = body.scheduled_time or ""
    post["thumbnail_url"] = body.thumbnail_url or ""
    
    if post["status"] in ("draft", "scheduled", "failed"):
        if body.scheduled_time:
            post["status"] = "scheduled"
        else:
            post["status"] = "draft"
            
    save_posts(posts)
    return {"success": True, "post": post}

@app.delete("/api/posts/{post_id}")
def delete_post(post_id: str):
    posts = load_posts()
    post_index = next((i for i, p in enumerate(posts) if p.get("id") == post_id), -1)
    if post_index == -1:
        raise HTTPException(status_code=404, detail="Post not found")
        
    post = posts.pop(post_index)
    if post.get("video_path") and os.path.exists(post.get("video_path")):
        try:
            if "downloads" in post.get("video_path") or "uploads" in post.get("video_path"):
                os.remove(post.get("video_path"))
        except Exception:
            pass
            
    save_posts(posts)
    return {"success": True}

@app.post("/api/posts/{post_id}/publish")
def publish_post_now(post_id: str):
    posts = load_posts()
    post_index = next((i for i, p in enumerate(posts) if p.get("id") == post_id), -1)
    if post_index == -1:
        raise HTTPException(status_code=404, detail="Post not found")
        
    post = posts[post_index]
    post["status"] = "processing"
    save_posts(posts)
    
    pub_thread = threading.Thread(target=publish_post_async, args=(post_id,))
    pub_thread.daemon = True
    pub_thread.start()
    
    return {"success": True, "message": "Publishing started"}

@app.post("/api/posts/bulk-publish")
def bulk_publish_posts(body: dict):
    post_ids = body.get("post_ids", [])
    posts = load_posts()
    
    count = 0
    for post_id in post_ids:
        post_index = next((i for i, p in enumerate(posts) if p.get("id") == post_id), -1)
        if post_index != -1:
            post = posts[post_index]
            if post.get("status") in ("draft", "scheduled", "failed", "uploaded"):
                post["status"] = "processing"
                count += 1
                pub_thread = threading.Thread(target=publish_post_async, args=(post_id,))
                pub_thread.daemon = True
                pub_thread.start()
                
    if count > 0:
        save_posts(posts)
        
    return {"success": True, "message": f"Started bulk publishing {count} posts"}

@app.post("/api/posts/bulk-delete")
def bulk_delete_posts(body: dict):
    post_ids = body.get("post_ids", [])
    posts = load_posts()
    
    new_posts = []
    for post in posts:
        if post.get("id") in post_ids:
            video_path = post.get("video_path")
            if video_path and os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except Exception:
                    pass
        else:
            new_posts.append(post)
            
    save_posts(new_posts)
    return {"success": True, "message": f"Deleted {len(posts) - len(new_posts)} posts"}

@app.get("/api/fb/status")
def get_facebook_status():
    config = load_fb_config()
    return {
        "connected": bool(config.get("user_access_token")),
        "user_name": config.get("user_name"),
        "user_id": config.get("user_id"),
        "app_id": config.get("app_id", ""),
        "app_secret_set": bool(config.get("app_secret")),
        "pages": [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "category": p.get("category"),
                "picture": p.get("picture", {}).get("data", {}).get("url") if isinstance(p.get("picture"), dict) else None
            }
            for p in config.get("pages", [])
        ]
    }

class StartOauthRequest(BaseModel):
    appId: str
    appSecret: str

@app.post("/api/fb/start_oauth")
def start_facebook_oauth(body: StartOauthRequest, request: Request):
    app_id = body.appId.strip()
    app_secret = body.appSecret.strip()
    
    config = load_fb_config()
    
    if not app_secret or app_secret == "••••••••••••••••":
        app_secret = config.get("app_secret", "")
        
    base_url = str(request.base_url).rstrip('/')
    
    # If no App ID/Secret is provided, redirect to the built-in simulator
    if not app_id or not app_secret:
        mock_url = f"{base_url}/api/fb/mock_login_page"
        return {"oauth_url": mock_url, "redirect_uri": f"{base_url}/api/fb/callback", "is_mock": True}
        
    config["app_id"] = app_id
    config["app_secret"] = app_secret
    save_fb_config(config)
    
    redirect_uri = f"{base_url}/api/fb/callback"
    
    oauth_url = (
        f"https://www.facebook.com/v20.0/dialog/oauth?"
        f"client_id={app_id}&"
        f"redirect_uri={quote(redirect_uri)}&"
        f"scope=pages_show_list,pages_read_engagement,pages_manage_posts,public_profile"
    )
    return {"oauth_url": oauth_url, "redirect_uri": redirect_uri}

@app.get("/api/fb/mock_login_page")
def mock_facebook_login_page(request: Request):
    from fastapi.responses import HTMLResponse
    base_url = str(request.base_url).rstrip('/')
    return HTMLResponse(
        content=f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Log in to Facebook | Facebook</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background-color: #f0f2f5;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                }}
                .header {{
                    margin-bottom: 20px;
                    text-align: center;
                }}
                .fb-logo {{
                    color: #1877f2;
                    font-size: 56px;
                    font-weight: bold;
                    letter-spacing: -2px;
                }}
                .login-container {{
                    background-color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.1);
                    box-sizing: border-box;
                    padding: 24px 24px;
                    width: 396px;
                    text-align: center;
                    transition: all 0.3s ease;
                }}
                h2 {{
                    font-size: 18px;
                    font-weight: normal;
                    margin-bottom: 18px;
                    color: #1c1e21;
                    line-height: 1.4;
                }}
                .input-field {{
                    width: 100%;
                    height: 52px;
                    padding: 14px 16px;
                    font-size: 17px;
                    border: 1px solid #dddfe2;
                    border-radius: 6px;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                    outline: none;
                    color: #1c1e21;
                }}
                .input-field:focus {{
                    border-color: #1877f2;
                    box-shadow: 0 0 0 2px #e7f3ff;
                }}
                .login-btn {{
                    width: 100%;
                    height: 48px;
                    background-color: #1877f2;
                    border: none;
                    border-radius: 6px;
                    color: #ffffff;
                    font-size: 20px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 6px;
                    transition: background-color 0.2s;
                }}
                .login-btn:hover {{
                    background-color: #166fe5;
                }}
                .divider {{
                    align-items: center;
                    border-bottom: 1px solid #dadde1;
                    display: flex;
                    margin: 20px 0;
                    text-align: center;
                }}
                .forgot-password {{
                    color: #1877f2;
                    font-size: 14px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 10px;
                }}
                .forgot-password:hover {{
                    text-decoration: underline;
                }}
                
                /* Permission screen state */
                .permissions-container {{
                    display: none;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.1);
                    padding: 24px;
                    width: 480px;
                    box-sizing: border-box;
                    text-align: left;
                }}
                .app-header {{
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid #e5e5e5;
                    padding-bottom: 16px;
                    margin-bottom: 16px;
                }}
                .app-icon {{
                    width: 48px;
                    height: 48px;
                    background: linear-gradient(135deg, #0284c7, #4f46e5);
                    border-radius: 12px;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 22px;
                }}
                .app-info h3 {{
                    margin: 0;
                    font-size: 18px;
                    color: #1c1e21;
                }}
                .app-info p {{
                    margin: 2px 0 0 0;
                    font-size: 13px;
                    color: #606770;
                }}
                .permission-list {{
                    list-style: none;
                    padding: 0;
                    margin: 0 0 24px 0;
                }}
                .permission-item {{
                    display: flex;
                    gap: 12px;
                    margin-bottom: 14px;
                    align-items: flex-start;
                }}
                .check-icon {{
                    color: #1877f2;
                    font-weight: bold;
                    font-size: 16px;
                }}
                .permission-text h4 {{
                    margin: 0;
                    font-size: 14px;
                    color: #1c1e21;
                }}
                .permission-text p {{
                    margin: 2px 0 0 0;
                    font-size: 12px;
                    color: #606770;
                }}
                .action-btns {{
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    border-top: 1px solid #e5e5e5;
                    padding-top: 16px;
                }}
                .btn {{
                    padding: 10px 20px;
                    font-size: 14px;
                    font-weight: 600;
                    border-radius: 6px;
                    cursor: pointer;
                    border: none;
                }}
                .btn-cancel {{
                    background-color: #e4e6eb;
                    color: #4b4f56;
                }}
                .btn-cancel:hover {{
                    background-color: #d8dadf;
                }}
                .btn-allow {{
                    background-color: #1877f2;
                    color: white;
                }}
                .btn-allow:hover {{
                    background-color: #166fe5;
                }}
            </style>
        </head>
        <body>
            <div class="header" id="headerSection">
                <div class="fb-logo">facebook</div>
            </div>
            
            <!-- Login Form Screen -->
            <div class="login-container" id="loginForm">
                <h2>Log in to use your Facebook account with <strong>Zen Post</strong></h2>
                <form id="fbForm" onsubmit="handleLogin(event)">
                    <input type="text" class="input-field" placeholder="Email address or phone number" required id="emailInput">
                    <input type="password" class="input-field" placeholder="Password" required>
                    <button type="submit" class="login-btn">Log In</button>
                    <div class="divider"></div>
                    <a href="#" class="forgot-password">Forgot password?</a>
                </form>
            </div>
            
            <!-- Permissions Dialog Screen -->
            <div class="permissions-container" id="permissionsDialog">
                <div class="app-header">
                    <div class="app-icon">ZP</div>
                    <div class="app-info">
                        <h3>Zen Post App</h3>
                        <p>wants to access information from Facebook</p>
                    </div>
                </div>
                
                <h4 style="margin: 0 0 12px 0; color: #606770; font-size: 13px;">THIS APP WOULD LIKE TO:</h4>
                
                <ul class="permission-list">
                    <li class="permission-item">
                        <span class="check-icon">✓</span>
                        <div class="permission-text">
                            <h4>Show list of Pages you manage</h4>
                            <p>Required to choose which Page you want to publish to</p>
                        </div>
                    </li>
                    <li class="permission-item">
                        <span class="check-icon">✓</span>
                        <div class="permission-text">
                            <h4>Publish as Pages managed by you</h4>
                            <p>Required to automatically publish video and image posts on your page</p>
                        </div>
                    </li>
                    <li class="permission-item">
                        <span class="check-icon">✓</span>
                        <div class="permission-text">
                            <h4>Read Page content and engagement</h4>
                            <p>Required to verify post success and show previews</p>
                        </div>
                    </li>
                </ul>
                
                <div class="action-btns">
                    <button class="btn btn-cancel" onclick="window.close()">Cancel</button>
                    <button class="btn btn-allow" id="continueBtn" onclick="proceedToCallback()">Continue</button>
                </div>
            </div>
            
            <script>
                function handleLogin(event) {{
                    event.preventDefault();
                    const email = document.getElementById('emailInput').value;
                    const cleanName = email.split('@')[0];
                    const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                    document.getElementById('continueBtn').innerText = "Continue as " + displayName;
                    localStorage.setItem('mock_fb_user', displayName);
                    
                    document.getElementById('loginForm').style.display = 'none';
                    document.getElementById('headerSection').style.display = 'none';
                    document.getElementById('permissionsDialog').style.display = 'block';
                }}
                
                function proceedToCallback() {{
                    const user = localStorage.getItem('mock_fb_user') || 'Facebook User';
                    window.location.href = "{base_url}/api/fb/callback?code=MOCK_FB_AUTH_CODE&user=" + encodeURIComponent(user);
                }}
            </script>
        </body>
        </html>
        """
    )

@app.get("/api/fb/callback")
def facebook_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None, user: Optional[str] = None):
    from fastapi.responses import HTMLResponse
    import requests
    
    if error:
        return HTMLResponse(
            status_code=400,
            content=f"""
            <html>
                <head>
                    <title>Link Failed</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                    <style>
                        body {{ font-family: 'Outfit', sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                        .card {{ background: #1e293b; border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 480px; width: 90%; text-align: center; border: 1px solid #ef4444; }}
                        h1 {{ color: #ef4444; margin-top: 0; margin-bottom: 16px; font-weight: 800; }}
                        p {{ color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }}
                        .btn {{ background: #ef4444; color: white; padding: 12px 28px; border: none; border-radius: 50px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.2s; }}
                        .btn:hover {{ background: #dc2626; }}
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Authentication Failed</h1>
                        <p>Facebook login was not completed: {error}</p>
                        <button class="btn" onclick="window.close()">Close Window</button>
                    </div>
                </body>
            </html>
            """
        )
    
    if not code:
        return HTMLResponse(
            status_code=400,
            content="""
            <html>
                <head>
                    <title>Link Failed</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Outfit', sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #1e293b; border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 480px; width: 90%; text-align: center; border: 1px solid #ef4444; }
                        h1 { color: #ef4444; margin-top: 0; margin-bottom: 16px; font-weight: 800; }
                        p { color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
                        .btn { background: #ef4444; color: white; padding: 12px 28px; border: none; border-radius: 50px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.2s; }
                        .btn:hover { background: #dc2626; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Missing Authorization Code</h1>
                        <p>No code was returned from Facebook.</p>
                        <button class="btn" onclick="window.close()">Close Window</button>
                    </div>
                </body>
            </html>
            """
        )
        
    try:
        config = load_fb_config()
        app_id = config.get("app_id")
        app_secret = config.get("app_secret")
        
        # If code is mock or configuration keys are missing, simulate success immediately
        if code == "MOCK_FB_AUTH_CODE" or not app_id or not app_secret:
            user_name = user or "Chansokpheaktra Phy (Demo)"
            
            # Auto-create unique user ID and pages based on user's name hash
            import hashlib
            name_hash = hashlib.md5(user_name.encode('utf-8')).hexdigest()
            user_id = "fb_" + "".join(str(ord(c)) for c in name_hash[:6])[:12]
            
            pages_list = [
                {
                    "id": f"page_{name_hash[:4]}_1",
                    "name": f"{user_name}'s Digital Media",
                    "category": "Digital Creator",
                    "picture": None
                },
                {
                    "id": f"page_{name_hash[:4]}_2",
                    "name": f"{user_name}'s Business Page",
                    "category": "E-Commerce",
                    "picture": None
                },
                {
                    "id": f"page_{name_hash[:4]}_3",
                    "name": f"{user_name}'s Gaming hub",
                    "category": "Gaming",
                    "picture": None
                }
            ]
            
            config["user_access_token"] = "EAAGzD123_MOCK_TOKEN_EAAgzd123_" + name_hash[:8]
            config["user_name"] = user_name
            config["user_id"] = user_id
            config["pages"] = pages_list
            save_fb_config(config)
            
            return HTMLResponse(
                content=f"""
                <html>
                    <head>
                        <title>Link Success</title>
                        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                        <style>
                            body {{
                                font-family: 'Outfit', sans-serif;
                                background: radial-gradient(circle at top left, #1e1b4b, #0f172a);
                                color: #f8fafc;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                                overflow: hidden;
                            }}
                            .card {{
                                background: rgba(30, 41, 59, 0.7);
                                backdrop-filter: blur(16px);
                                border-radius: 20px;
                                padding: 50px 40px;
                                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                                max-width: 500px;
                                width: 90%;
                                text-align: center;
                                border: 1px solid rgba(255, 255, 255, 0.1);
                                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                            }}
                            @keyframes slideUp {{
                                from {{ opacity: 0; transform: translateY(30px); }}
                                to {{ opacity: 1; transform: translateY(0); }}
                            }}
                            .icon {{
                                font-size: 64px;
                                margin-bottom: 24px;
                                animation: bounce 2s infinite;
                            }}
                            @keyframes bounce {{
                                0%, 100% {{ transform: translateY(0); }}
                                50% {{ transform: translateY(-10px); }}
                            }}
                            h1 {{
                                color: #38bdf8;
                                font-weight: 800;
                                font-size: 28px;
                                margin: 0 0 16px 0;
                                background: linear-gradient(135deg, #38bdf8, #818cf8);
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                            }}
                            p {{
                                color: #94a3b8;
                                font-size: 16px;
                                line-height: 1.6;
                                margin: 0 0 30px 0;
                            }}
                            .user-badge {{
                                display: inline-flex;
                                align-items: center;
                                background: rgba(56, 189, 248, 0.1);
                                border: 1px solid rgba(56, 189, 248, 0.2);
                                padding: 10px 20px;
                                border-radius: 50px;
                                font-weight: 600;
                                color: #38bdf8;
                                margin-bottom: 30px;
                            }}
                            .btn {{
                                background: linear-gradient(135deg, #0284c7, #4f46e5);
                                color: white;
                                padding: 14px 32px;
                                border: none;
                                border-radius: 50px;
                                font-weight: 700;
                                font-size: 16px;
                                cursor: pointer;
                                box-shadow: 0 10px 20px -10px rgba(79, 70, 229, 0.5);
                                transition: all 0.3s ease;
                                text-decoration: none;
                                display: inline-block;
                            }}
                            .btn:hover {{
                                transform: translateY(-2px);
                                box-shadow: 0 15px 25px -10px rgba(79, 70, 229, 0.6);
                                background: linear-gradient(135deg, #0369a1, #4338ca);
                            }}
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="icon">✨</div>
                            <h1>Link Account Success!</h1>
                            <p>Zen Post is now connected to Facebook. You can close this window now and return to the application.</p>
                            <div class="user-badge">
                                <span>Logged in as: {user_name} (Demo Mode)</span>
                            </div>
                            <div>
                                <button class="btn" onclick="window.close()">Close Window</button>
                            </div>
                        </div>
                    </body>
                </html>
                """
            )
        else:
            # Real OAuth code-to-token exchange
            base_url = str(request.base_url).rstrip('/')
            redirect_uri = f"{base_url}/api/fb/callback"
            token_url = (
                f"https://graph.facebook.com/v20.0/oauth/access_token?"
                f"client_id={app_id}&"
                f"redirect_uri={quote(redirect_uri)}&"
                f"client_secret={app_secret}&"
                f"code={code}"
            )
            token_res = requests.get(token_url, timeout=15)
            token_data = token_res.json()
            if "error" in token_data:
                raise Exception(token_data["error"].get("message", "Failed to exchange authorization code"))
                
            token = token_data.get("access_token")
            if not token:
                raise Exception("No access token returned from Facebook")
                
            # Get User Profile
            profile_res = requests.get(
                f"https://graph.facebook.com/v20.0/me?fields=id,name,picture&access_token={token}",
                timeout=15
            )
            profile_data = profile_res.json()
            if "error" in profile_data:
                raise Exception(profile_data["error"].get("message", "Failed to fetch user profile"))
            user_name = profile_data.get("name", "Facebook User")
            user_id = profile_data.get("id", "")
            
            # Get User Pages
            pages_res = requests.get(
                f"https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,picture&access_token={token}",
                timeout=15
            )
            pages_data = pages_res.json()
            if "error" in pages_data:
                pages_list = []
            else:
                pages_list = pages_data.get("data", [])
                
            config["user_access_token"] = token
            config["user_name"] = user_name
            config["user_id"] = user_id
            config["pages"] = pages_list
            save_fb_config(config)
            
            return HTMLResponse(
                content=f"""
                <html>
                    <head>
                        <title>Link Success</title>
                        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                        <style>
                            body {{
                                font-family: 'Outfit', sans-serif;
                                background: radial-gradient(circle at top left, #1e1b4b, #0f172a);
                                color: #f8fafc;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                                overflow: hidden;
                            }}
                            .card {{
                                background: rgba(30, 41, 59, 0.7);
                                backdrop-filter: blur(16px);
                                border-radius: 20px;
                                padding: 50px 40px;
                                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                                max-width: 500px;
                                width: 90%;
                                text-align: center;
                                border: 1px solid rgba(255, 255, 255, 0.1);
                                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                            }}
                            @keyframes slideUp {{
                                from {{ opacity: 0; transform: translateY(30px); }}
                                to {{ opacity: 1; transform: translateY(0); }}
                            }}
                            .icon {{
                                font-size: 64px;
                                margin-bottom: 24px;
                                animation: bounce 2s infinite;
                            }}
                            @keyframes bounce {{
                                0%, 100% {{ transform: translateY(0); }}
                                50% {{ transform: translateY(-10px); }}
                            }}
                            h1 {{
                                color: #38bdf8;
                                font-weight: 800;
                                font-size: 28px;
                                margin: 0 0 16px 0;
                                background: linear-gradient(135deg, #38bdf8, #818cf8);
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                            }}
                            p {{
                                color: #94a3b8;
                                font-size: 16px;
                                line-height: 1.6;
                                margin: 0 0 30px 0;
                            }}
                            .user-badge {{
                                display: inline-flex;
                                align-items: center;
                                background: rgba(56, 189, 248, 0.1);
                                border: 1px solid rgba(56, 189, 248, 0.2);
                                padding: 10px 20px;
                                border-radius: 50px;
                                font-weight: 600;
                                color: #38bdf8;
                                margin-bottom: 30px;
                            }}
                            .btn {{
                                background: linear-gradient(135deg, #0284c7, #4f46e5);
                                color: white;
                                padding: 14px 32px;
                                border: none;
                                border-radius: 50px;
                                font-weight: 700;
                                font-size: 16px;
                                cursor: pointer;
                                box-shadow: 0 10px 20px -10px rgba(79, 70, 229, 0.5);
                                transition: all 0.3s ease;
                                text-decoration: none;
                                display: inline-block;
                            }}
                            .btn:hover {{
                                transform: translateY(-2px);
                                box-shadow: 0 15px 25px -10px rgba(79, 70, 229, 0.6);
                                background: linear-gradient(135deg, #0369a1, #4338ca);
                            }}
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="icon">✨</div>
                            <h1>Link Account Success!</h1>
                            <p>Zen Post is now connected to Facebook. You can close this window now and return to the application.</p>
                            <div class="user-badge">
                                <span>Logged in as: {user_name}</span>
                            </div>
                            <div>
                                <button class="btn" onclick="window.close()">Close Window</button>
                            </div>
                        </div>
                    </body>
                </html>
                """
            )
    except Exception as e:
        return HTMLResponse(
            status_code=400,
            content=f"""
            <html>
                <head>
                    <title>Link Failed</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                    <style>
                        body {{ font-family: 'Outfit', sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                        .card {{ background: #1e293b; border-radius: 20px; padding: 45px 35px; box-shadow: 0 15px 30px rgba(0,0,0,0.3); max-width: 480px; width: 90%; text-align: center; border: 1px solid rgba(239, 68, 68, 0.3); }}
                        h1 {{ color: #f87171; font-weight: 800; font-size: 26px; margin: 0 0 16px 0; }}
                        p {{ color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; }}
                        .btn {{ background: #ef4444; color: white; padding: 12px 28px; border: none; border-radius: 50px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.2s; }}
                        .btn:hover {{ background: #dc2626; }}
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Authentication Failed</h1>
                        <p>Error details: {e}</p>
                        <button class="btn" onclick="window.close()">Close Window</button>
                    </div>
                </body>
            </html>
            """
        )

@app.post("/api/fb/connect")
def connect_facebook(body: ConnectRequest):
    token = body.accessToken.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token cannot be empty")
        
    try:
        profile_res = requests.get(
            f"https://graph.facebook.com/v20.0/me?fields=id,name,picture&access_token={token}",
            timeout=15
        )
        profile_data = profile_res.json()
        if "error" in profile_data:
            raise Exception(profile_data["error"]["message"])
            
        user_name = profile_data.get("name", "Unknown User")
        user_id = profile_data.get("id", "")
        
        pages_res = requests.get(
            f"https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,picture&access_token={token}",
            timeout=15
        )
        pages_data = pages_res.json()
        if "error" in pages_data:
            pages_list = []
        else:
            pages_list = pages_data.get("data", [])
            
        config = load_fb_config()
        config["user_access_token"] = token
        config["user_name"] = user_name
        config["user_id"] = user_id
        config["pages"] = pages_list
        save_fb_config(config)
        
        return {
            "success": True,
            "user_name": user_name,
            "user_id": user_id,
            "pages": [
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "category": p.get("category"),
                    "picture": p.get("picture", {}).get("data", {}).get("url") if isinstance(p.get("picture"), dict) else None
                }
                for p in pages_list
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to connect: {e}")

@app.post("/api/fb/disconnect")
def disconnect_facebook():
    config = load_fb_config()
    config["user_access_token"] = ""
    config["user_name"] = ""
    config["user_id"] = ""
    config["pages"] = []
    save_fb_config(config)
    return {"success": True}

DB_DOWNLOADS_FILE = os.path.join(BASE_DIR, "downloads_db.json")

def load_downloads():
    if not os.path.exists(DB_DOWNLOADS_FILE):
        return []
    try:
        with open(DB_DOWNLOADS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_downloads(downloads):
    try:
        with open(DB_DOWNLOADS_FILE, "w", encoding="utf-8") as f:
            json.dump(downloads, f, indent=4)
    except Exception:
        pass

def download_audio_file(url, directory, output_template, progress_hook=None):
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
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }

    if ffmpeg_location:
        ydl_opts["ffmpeg_location"] = ffmpeg_location

    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if not info:
        raise RuntimeError("No audio information was returned.")

    base_path_without_ext = os.path.splitext(output_template)[0]
    expected_mp3_path = f"{base_path_without_ext}.mp3"
    if os.path.exists(expected_mp3_path):
        return info, expected_mp3_path
    
    raise RuntimeError("Downloaded audio file was not found.")

@app.get("/api/downloads")
def get_downloads():
    return load_downloads()

@app.post("/api/downloads")
def create_download(body: MediaDownloadRequest, request: Request):
    import queue
    import threading
    from fastapi.responses import StreamingResponse

    q = queue.Queue()

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            if total > 0:
                percent = round((downloaded / total) * 100, 1)
            else:
                percent = 0.0
            q.put({"status": "downloading", "percent": percent})
        elif d['status'] == 'finished':
            q.put({"status": "processing", "percent": 99.0})

    def worker():
        try:
            import uuid
            url = validate_http_url(body.url)
            video_id = safe_video_id(url)
            
            if body.format == "mp3":
                output_template = os.path.join(DOWNLOAD_DIR, f"{video_id}.%(ext)s")
                info, file_path = download_audio_file(url, DOWNLOAD_DIR, output_template, progress_hook=progress_hook)
                filename = os.path.basename(file_path)
                thumbnail_url = info.get("thumbnail") or ""
            else:
                output_template = os.path.join(DOWNLOAD_DIR, f"{video_id}.%(ext)s")
                info, file_path = download_video_file(url, DOWNLOAD_DIR, output_template, progress_hook=progress_hook)
                filename = os.path.basename(file_path)
                
                try:
                    thumbnail_filenames = generate_video_thumbnails(file_path)
                    if thumbnail_filenames:
                        thumbnail_url = f"{str(request.base_url).rstrip('/')}/thumbnails/{quote(thumbnail_filenames[0])}"
                    else:
                        thumbnail_url = info.get("thumbnail") or ""
                except Exception:
                    thumbnail_url = info.get("thumbnail") or ""

            # Copy to custom folder if specified and valid
            saved_path = ""
            if body.save_folder:
                folder = os.path.expanduser(body.save_folder.strip())
                if folder:
                    try:
                        os.makedirs(folder, exist_ok=True)
                        dest_path = os.path.join(folder, filename)
                        shutil.copy2(file_path, dest_path)
                        saved_path = dest_path
                    except Exception as e:
                        print(f"Failed to copy download file to custom folder: {e}")

            downloads = load_downloads()
            downloads = [d for d in downloads if not (d.get("url") == url and d.get("format") == body.format)]
            
            download_id = str(uuid.uuid4())
            new_download = {
                "id": download_id,
                "title": info.get("title") or filename,
                "url": url,
                "format": body.format,
                "filename": filename,
                "file_url": build_public_url(request, filename),
                "thumbnail_url": thumbnail_url,
                "duration": info.get("duration"),
                "created_at": datetime.now().isoformat(),
                "saved_path": saved_path
            }
            
            downloads.insert(0, new_download)
            save_downloads(downloads)
            
            q.put({"status": "success", "percent": 100.0, "download": new_download})
        except Exception as e:
            q.put({"status": "error", "message": str(e)})

    # Start the worker thread
    t = threading.Thread(target=worker)
    t.daemon = True
    t.start()

    def generate():
        while True:
            try:
                # Poll queue with timeout to release thread if client disconnects
                msg = q.get(timeout=60.0)
                yield json.dumps(msg) + "\n"
                if msg.get("status") in ("success", "error"):
                    break
            except queue.Empty:
                yield json.dumps({"status": "error", "message": "Download timeout (no activity for 60s)"}) + "\n"
                break
            except Exception as ex:
                yield json.dumps({"status": "error", "message": str(ex)}) + "\n"
                break

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/api/open-folder")
def open_folder(body: FilePathRequest):
    import os
    import subprocess
    import platform
    
    path = body.file_path.strip()
    if not path:
        return {"success": False, "error": "Path is empty"}
        
    expanded_path = os.path.expanduser(path)
    if not os.path.isabs(expanded_path):
        expanded_path = os.path.join(DOWNLOAD_DIR, expanded_path)
    try:
        if os.path.exists(expanded_path):
            if platform.system() == "Windows":
                if os.path.isfile(expanded_path):
                    subprocess.run(["explorer", "/select,", os.path.normpath(expanded_path)], check=True)
                else:
                    os.startfile(os.path.normpath(expanded_path))
            else:
                if os.path.isfile(expanded_path):
                    parent = os.path.dirname(expanded_path)
                else:
                    parent = expanded_path
                if platform.system() == "Darwin":
                    subprocess.run(["open", parent], check=True)
                else:
                    subprocess.run(["xdg-open", parent], check=True)
            return {"success": True}
        else:
            return {"success": False, "error": f"Path does not exist: {expanded_path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.delete("/api/downloads/{download_id}")
def delete_download(download_id: str):
    downloads = load_downloads()
    dl_index = next((i for i, d in enumerate(downloads) if d.get("id") == download_id), -1)
    if dl_index == -1:
        raise HTTPException(status_code=404, detail="Download not found")
        
    download = downloads.pop(dl_index)
    file_path = os.path.join(DOWNLOAD_DIR, download.get("filename"))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
            
    save_downloads(downloads)
    return {"success": True}

@app.post("/api/choose-folder")
def choose_folder():
    import tkinter as tk
    from tkinter import filedialog
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(title="Select Folder to Store Videos")
        root.destroy()
        return {"success": True, "folder": folder}
    except Exception as e:
        return {"success": False, "error": str(e), "folder": ""}

@app.get("/")
def root():
    return {"message": "Zen Post App API is running"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)

