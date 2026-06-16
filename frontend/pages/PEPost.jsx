import React, { useEffect, useRef, useState } from 'react';
import './PEPost.css';
import VideoPlayer from '../components/VideoPlayer.jsx';
import DateTimePicker from '../calendar/Calendar.jsx';
import CTABox from '../components/CTABox.jsx';
import FacebookPreview from '../components/FacebookPreview.jsx';

export default function PEPost() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://zen-post-1.onrender.com";
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [facebookAccount, setFacebookAccount] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [caption, setCaption] = useState('');
  const [captionSource, setCaptionSource] = useState('manual');
  const [ctaAction, setCtaAction] = useState('');
  const [recentCtaActions, setRecentCtaActions] = useState(() => {
    const saved = localStorage.getItem('recentCtaActions');
    return saved ? JSON.parse(saved) : [];
  });

  const now = new Date();
  const [scheduledDate, setScheduledDate] = useState(() => now.toISOString().split('T')[0]);
  const [scheduledHour, setScheduledHour] = useState(() => String(now.getHours()).padStart(2, '0'));
  const [scheduledMinute, setScheduledMinute] = useState(() => String(now.getMinutes()).padStart(2, '0'));
  const [showCalendar, setShowCalendar] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [thumbnails, setThumbnails] = useState([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState('');
  const autoPreviewTimer = useRef(null);
  const fileInputRef = useRef(null);
  const thumbnailRequestId = useRef(0);

  useEffect(() => {
    return () => {
      if (autoPreviewTimer.current) {
        clearTimeout(autoPreviewTimer.current);
      }

      if (videoPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, []);

  const formatScheduledDateTime = () => {
    if (!scheduledDate) return 'Select date and time';
    const hour24 = parseInt(scheduledHour, 10) || 0;
    const minute = parseInt(scheduledMinute, 10) || 0;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    const dateObj = new Date(`${scheduledDate}T${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${formattedDate}, ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
  };

  const getEmbedUrl = (url) => {
    try {
      const u = new URL(url);

      if (u.hostname.includes('tiktok.com')) {
        const videoMatch = u.pathname.match(/\/video\/(\d+)/);
        const embedMatch = u.pathname.match(/^\/embed\/v2\/(\d+)/);
        const id = videoMatch?.[1] || embedMatch?.[1];
        if (id) return `https://www.tiktok.com/embed/v2/${id}`;
      }

      if (u.hostname.includes('youtube.com')) {
        const videoId = u.searchParams.get('v') || (u.pathname.includes('/shorts/') ? u.pathname.split('/').pop() : null);
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (u.hostname === 'youtu.be') {
        const videoId = u.pathname.split('/').pop();
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (u.hostname.includes('facebook.com')) {
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}`;
      }
    } catch (e) {
      // invalid URL, fall through
    }

    return url;
  };

  const isEmbedUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.hostname.includes('tiktok.com') && u.pathname.startsWith('/embed')) return true;
      if ((u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') && u.pathname.startsWith('/embed')) return true;
      if (u.hostname.includes('facebook.com') && u.pathname.includes('/plugins')) return true;
      return false;
    } catch (e) {
      return false;
    }
  };

  const cleanCaption = (value) => {
    if (!value) return '';
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text && text !== 'N/A' ? text : '';
  };

  const normalizeVideoUrl = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  };

  const isValidHttpUrl = (value) => /^https?:\/\//i.test(value || '');

  const isVideoFile = (file) => Boolean(file && (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(file.name)));

  const captionFromUrl = (url) => {
    try {
      const parsed = new URL(url);
      const fileName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname);
      const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      return cleanCaption(title || parsed.hostname);
    } catch (e) {
      return cleanCaption(url);
    }
  };

  const captionFromFile = (file) => cleanCaption((file?.name || '').replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '));

  const generateLocalThumbnails = (videoUrl, count = 4) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const thumbnails = [];

      const cleanup = () => {
        video.removeAttribute('src');
        video.load();
      };

      const finish = () => {
        cleanup();
        resolve(thumbnails);
      };

      if (!context) {
        finish();
        return;
      }

      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;

      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 180;

        canvas.width = width;
        canvas.height = height;

        if (duration <= 0.1) {
          context.drawImage(video, 0, 0, width, height);
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.82));
          finish();
          return;
        }

        const captureAt = (index) => {
          const time = (duration * (index + 1)) / (count + 1);
          video.currentTime = Math.min(time, Math.max(duration - 0.05, 0));
        };

        const captureNext = (index) => {
          if (index >= count) {
            finish();
            return;
          }

          video.onseeked = () => {
            context.drawImage(video, 0, 0, width, height);
            thumbnails.push(canvas.toDataURL('image/jpeg', 0.82));
            captureNext(index + 1);
          };

          captureAt(index);
        };

        captureNext(0);
      };

      video.onerror = finish;
    });
  };

  const extractVideoFromUrl = async (url) => {
    const response = await fetch(`${API_BASE_URL}/extract-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Could not extract video');
    }

    return data;
  };

  const loadVideoFromUrl = async (url) => {
    if (!url) return;

    setIsExtracting(true);
    setExtractError('');

    try {
      const extractedData = await extractVideoFromUrl(url);
      if (videoPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }

      thumbnailRequestId.current += 1;

      setVideoPreviewUrl(extractedData.video_url);
      setVideoFile(null);
      setThumbnails(extractedData.thumbnails || []);
      setSelectedThumbnail(extractedData.thumbnail || (extractedData.thumbnails?.[0]) || '');
      setIsLoaded(true);

      const extractedCaption = cleanCaption(extractedData.caption || extractedData.title || captionFromUrl(url));
      if (!caption.trim() || captionSource !== 'manual') {
        setCaption(extractedCaption);
        setCaptionSource('auto');
      }
    } catch (error) {
      setVideoPreviewUrl(url);
      setVideoFile(null);
      setIsLoaded(true);
      setExtractError(error.message);

      const fallbackCaption = captionFromUrl(url);
      if (!caption.trim() || captionSource !== 'manual') {
        setCaption(fallbackCaption);
        setCaptionSource('auto');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLoadVideo = async () => {
    const url = normalizeVideoUrl(videoUrl);
    setVideoUrl(url);
    thumbnailRequestId.current += 1;
    await loadVideoFromUrl(url);
  };

  const handleClearVideo = () => {
    if (videoPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    setVideoUrl('');
    setVideoPreviewUrl('');
    setVideoFile(null);
    setCaption('');
    setCaptionSource('manual');
    setThumbnails([]);
    setSelectedThumbnail('');
    setIsLoaded(false);
    setIsExtracting(false);
    setExtractError('');
    thumbnailRequestId.current += 1;
    autoPreviewTimer.current = null;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectThumbnail = (thumbnailUrl) => {
    setSelectedThumbnail(thumbnailUrl);
  };

  const handleUrlChange = (e) => {
    const value = normalizeVideoUrl(e.target.value);
    setVideoUrl(value);
    setExtractError('');
    thumbnailRequestId.current += 1;

    if (autoPreviewTimer.current) {
      clearTimeout(autoPreviewTimer.current);
    }

    if (isValidHttpUrl(value)) {
      autoPreviewTimer.current = setTimeout(() => {
        loadVideoFromUrl(value);
      }, 500);
      return;
    }

    setVideoPreviewUrl('');
    setVideoFile(null);
    setIsLoaded(false);
    setIsExtracting(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];

    if (isVideoFile(file)) {
      if (videoPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }

      thumbnailRequestId.current += 1;
      const requestId = thumbnailRequestId.current;
      const objectUrl = URL.createObjectURL(file);

      setVideoFile(file);
      setVideoPreviewUrl(objectUrl);
      setVideoUrl('');
      setThumbnails([]);
      setSelectedThumbnail('');
      setIsLoaded(true);
      setIsExtracting(false);
      setExtractError('');

      const fileCaption = captionFromFile(file);
      if (!caption.trim() || captionSource !== 'manual') {
        setCaption(fileCaption);
        setCaptionSource('auto');
      }

      const generatedThumbnails = await generateLocalThumbnails(objectUrl);
      if (thumbnailRequestId.current !== requestId) {
        return;
      }

      setThumbnails(generatedThumbnails);
      setSelectedThumbnail(generatedThumbnails[0] || '');
    }
  };

  const handleUploadNow = async () => {
    if (!videoPreviewUrl) {
      alert('Please select video');
      return;
    }

    const scheduledTimeValue = getScheduledTime();
    if (scheduledTimeValue) {
      if (!isFutureDateTime(scheduledTimeValue)) {
        alert('Scheduled time must be in the future');
        return;
      }
    }

    setIsLoading(true);

    try {
      const formData = new FormData();

      if (videoFile) {
        formData.append('video', videoFile);
      }

      formData.append('video_url', videoUrl);
      formData.append('account', facebookAccount);
      formData.append('page', facebookPage);
      formData.append('caption', caption);
      formData.append('scheduled_time', getScheduledTime());
      formData.append('thumbnail', selectedThumbnail);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        alert('Upload success');
        handleClearVideo();
      } else {
        alert(data.detail);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getScheduledTime = () => {
    if (!scheduledDate || scheduledHour === '' || scheduledMinute === '') return '';
    const hour = parseInt(scheduledHour, 10) || 0;
    const minute = parseInt(scheduledMinute, 10) || 0;
    return `${scheduledDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const isFutureDateTime = (dateTimeStr) => {
    const selected = new Date(dateTimeStr);
    const now = new Date();
    return selected > now;
  };

  const renderPreview = () => {
    const embedUrl = videoPreviewUrl ? getEmbedUrl(videoPreviewUrl) : '';
    const isEmbed = Boolean(embedUrl && isEmbedUrl(embedUrl));

    return (
      <div className="video-preview-card">
        {caption ? (
          <div className="preview-caption">{caption}</div>
        ) : (
          <div className="preview-caption preview-caption-empty">Caption will appear here</div>
        )}

        {extractError && (
          <div className="extract-message extract-message--error">
            {extractError}
          </div>
        )}

        {!videoPreviewUrl ? (
          <div className="video-frame video-frame--placeholder">
            <div className="preview-placeholder">
              {isExtracting ? 'Extracting video...' : 'No video loaded'}
            </div>
          </div>
        ) : isEmbed ? (
          <div className="video-frame video-frame--placeholder">
            <div className="preview-placeholder clean-player-message">
              Use an uploaded video or direct MP4 URL for the clean video player.
            </div>
          </div>
        ) : (
          <VideoPlayer src={videoPreviewUrl} />
        )}
      </div>
    );
  };

  return (
    <div className="dashboard">
      <div className="form-section" id="pe-post">
        <h2>Facebook Account & Page</h2>
        <div className="input-group">
          <label>Account:</label>
          <button
            type="button"
            onClick={() => {}}
            className="add-account-btn"
          >
            + Add Account
          </button>
        </div>
        <div className="input-group">
          <label>Page:</label>
          <div className="page-dropdown" onClick={() => {}}>
            <span className="page-flag">🇺🇸</span>
            <span className="page-text">Choose Pages</span>
            <span className="page-arrow">▼</span>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h2>Video URL</h2>
        <div className="input-group">
          <input
            type="text"
            placeholder="Paste video URL here..."
            value={videoUrl}
            onChange={handleUrlChange}
            className="video-url-input"
          />
          <button
            type="button"
            onClick={isLoaded ? handleClearVideo : handleLoadVideo}
            className="load-btn"
          >
            {isLoaded ? 'Clear' : 'Load Preview'}
          </button>
        </div>

        <div className="divider">OR</div>

        <label htmlFor="video-upload" className="upload-label">
          Upload Video
        </label>

        <input
          id="video-upload"
          type="file"
          accept="video/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          hidden
        />

        {videoUrl && isValidHttpUrl(videoUrl) ? (
          <p className="file-name">
            <a href={videoUrl} target="_blank" rel="noreferrer">
              {videoUrl}
            </a>
          </p>
        ) : (
          videoFile && <p className="file-name">{videoFile.name}</p>
        )}
      </div>

      <div className="preview-section">
        <h2>Preview</h2>
        {renderPreview()}
      </div>

      <div className="form-section">
        <h2>Caption</h2>
        <textarea
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
            setCaptionSource('manual');
          }}
          className="caption-input"
          rows="4"
          placeholder="Write your caption here..."
        />
      </div>

      <CTABox
        value={ctaAction}
        onChange={setCtaAction}
        recentActions={recentCtaActions}
        onAdd={(action) => {
          if (!action) {
            alert('Please enter CTA text.');
            return;
          }

          const updated = [...new Set([action, ...recentCtaActions].slice(0, 10))];
          setRecentCtaActions(updated);
          localStorage.setItem('recentCtaActions', JSON.stringify(updated));

          alert(`Added CTA: ${action}`);
        }}
      />

      <div className="form-section">
        <h2>Select Thumbnail</h2>
        {thumbnails.length > 0 ? (
          <div className="thumbnail-scroll">
            {thumbnails.map((thumbnailUrl, index) => (
              <button
                key={thumbnailUrl}
                type="button"
                onClick={() => handleSelectThumbnail(thumbnailUrl)}
                className={`thumbnail-button${selectedThumbnail === thumbnailUrl ? ' thumbnail-button--selected' : ''}`}
              >
                <img src={thumbnailUrl} alt={`Frame ${index + 1}`} className="thumbnail-image" />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="thumbnail-placeholder-button"
            onClick={handleLoadVideo}
            disabled={!videoUrl || isExtracting}
            aria-label="Load a preview to select a thumbnail"
          >
            <span className="thumbnail-placeholder-image">IMG</span>
            <span className="thumbnail-placeholder-text">Load a preview to select a thumbnail.</span>
          </button>
        )}
        {extractError && (
          <p className="thumbnail-error">ERROR: Cannot read image. Please try again or contact support.</p>
        )}
      </div>

      <FacebookPreview
        pageName={facebookPage || 'Page Name'}
        caption={caption}
        videoSrc={videoPreviewUrl}
        ctaText={ctaAction}
        selectedThumbnail={selectedThumbnail}
      />

      <div className="form-section">
        <h2>Schedule Post</h2>
        <div className="schedule-line">
          <span className="schedule-display">{formatScheduledDateTime()}</span>
          <button
            type="button"
            className="calendar-trigger-btn"
            onClick={() => setShowCalendar(true)}
          >
            Pick Date & Time
          </button>
        </div>
        <div className="button-group">
          <button
            type="button"
            onClick={handleUploadNow}
            className="upload-now-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Uploading...' : 'Upload Now'}
          </button>
        </div>
        {showCalendar && (
          <div className="calendar-modal">
            <DateTimePicker
              value={`${scheduledDate}T${scheduledHour}:${scheduledMinute}`}
              onChange={(dateTime) => {
                const [date, time] = dateTime.split('T');
                const [hour, minute] = time.split(':');
                setScheduledDate(date);
                setScheduledHour(hour);
                setScheduledMinute(minute);
                setShowCalendar(false);
              }}
              onCancel={() => setShowCalendar(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
