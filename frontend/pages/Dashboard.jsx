import React, { useRef, useState } from 'react';
import './Dashboard.css';
import VideoPlayer from '../components/VideoPlayer.jsx';
import Calendar from '../calendar/Calendar.jsx';

export default function Dashboard() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://zen-post-1.onrender.com";
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [facebookAccount, setFacebookAccount] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [caption, setCaption] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledHour, setScheduledHour] = useState('');
  const [scheduledMinute, setScheduledMinute] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const autoPreviewTimer = useRef(null);

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

      setVideoPreviewUrl(extractedData.video_url);
      setVideoFile(null);
      setIsLoaded(true);

      if (!caption.trim()) {
        setCaption(cleanCaption(extractedData.caption));
      }
    } catch (error) {
      setVideoPreviewUrl(url);
      setVideoFile(null);
      setIsLoaded(true);
      setExtractError(error.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLoadVideo = async () => {
    const url = videoUrl.trim();
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
    setIsLoaded(false);
    setIsExtracting(false);
    setExtractError('');
  };

  const handleUrlChange = (e) => {
    const value = e.target.value.trim();
    setVideoUrl(value);
    setExtractError('');

    if (autoPreviewTimer.current) {
      clearTimeout(autoPreviewTimer.current);
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];

    if (file && file.type.startsWith('video/')) {
      if (videoPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }

      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setVideoUrl('');
      setIsLoaded(true);
      setIsExtracting(false);
      setExtractError('');
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
      <header className="dashboard-header">
        <h1>Facebook Post Scheduler</h1>
      </header>

      <div className="form-section">
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
          onChange={handleFileChange}
          hidden
        />

        {videoFile && <p className="file-name">{videoFile.name}</p>}
      </div>

      <div className="preview-section">
        <h2>Preview</h2>
        {renderPreview()}
      </div>

      <div className="form-section">
        <h2>Caption</h2>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="caption-input"
          rows="4"
          placeholder="Write your caption here..."
        />
      </div>

      <div className="form-section">
        <h2>Schedule Post</h2>
        <div className="input-group">
          <label>Date:</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            min={todayStr}
            className="date-input"
          />
        </div>
        <div className="input-group">
          <label>Time:</label>
          <div className="time-inputs">
            <input
              type="number"
              min="0"
              max="23"
              value={scheduledHour}
              onChange={(e) => setScheduledHour(e.target.value)}
              className="hour-input"
              placeholder="HH"
            />
            <span className="time-separator">:</span>
            <input
              type="number"
              min="0"
              max="59"
              value={scheduledMinute}
              onChange={(e) => setScheduledMinute(e.target.value)}
              className="minute-input"
              placeholder="MM"
            />
          </div>
        </div>
        <div className="button-group">
          <button
            type="button"
            onClick={() => setShowCalendar(true)}
            className="calendar-trigger-btn"
          >
            Pick Date & Time
          </button>
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
            <Calendar
              onApply={(dateTime) => {
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
