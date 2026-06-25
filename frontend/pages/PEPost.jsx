import React, { useEffect, useRef, useState } from 'react';
import './PEPost.css';
import VideoPlayer from '../components/VideoPlayer.jsx';
import DateTimePicker from '../calendar/Calendar.jsx';
import FacebookPreview from '../components/FacebookPreview.jsx';

export default function PEPost() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? "http://localhost:10000" 
      : "https://zen-post-1.onrender.com");
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [facebookAccount, setFacebookAccount] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [caption, setCaption] = useState('');
  const [fbStatus, setFbStatus] = useState({ connected: false, user_name: '', user_id: '', pages: [] });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [fbAccessTokenInput, setFbAccessTokenInput] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [fbAppSecret, setFbAppSecret] = useState('');
  const [connectTab, setConnectTab] = useState('oauth');
  const [isConnectingFb, setIsConnectingFb] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [captionSource, setCaptionSource] = useState('manual');
  const [ctaAction, setCtaAction] = useState('');
  const [ctaText, setCtaText] = useState('Support page Share & Follow');
  const [recentCtaActions, setRecentCtaActions] = useState(() => {
    const saved = localStorage.getItem('recentCtaActions');
    return saved ? JSON.parse(saved) : [];
  });

  const now = new Date();
  // Get local ISO date: YYYY-MM-DD
  const localDateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const [scheduledDate, setScheduledDate] = useState(localDateStr);
  const [scheduledHour, setScheduledHour] = useState(() => String(now.getHours()).padStart(2, '0'));
  const [scheduledMinute, setScheduledMinute] = useState(() => String(now.getMinutes()).padStart(2, '0'));
  const [showCalendar, setShowCalendar] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [thumbnails, setThumbnails] = useState([]);
  const [customThumbnails, setCustomThumbnails] = useState(() => {
    const saved = localStorage.getItem('customThumbnails');
    return saved ? JSON.parse(saved) : [];
  });
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

  useEffect(() => {
    fetchFbStatus();
  }, []);

  // Enforce future date and time selection in real-time
  useEffect(() => {
    if (!scheduledDate || scheduledHour === '' || scheduledMinute === '') return;

    const currNow = new Date();
    const todayISO = new Date(currNow.getTime() - currNow.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    // If selected date is in the past, reset it to today
    if (scheduledDate < todayISO) {
      setScheduledDate(todayISO);
      return;
    }

    // If date is today, check if selected hour/minute is in the past
    if (scheduledDate === todayISO) {
      const selectedHourInt = parseInt(scheduledHour, 10);
      const selectedMinInt = parseInt(scheduledMinute, 10);
      const currentHour = currNow.getHours();
      const currentMin = currNow.getMinutes();

      if (
        selectedHourInt < currentHour || 
        (selectedHourInt === currentHour && selectedMinInt < currentMin)
      ) {
        // Snap to current hour/minute + 2 minutes buffer
        const futureNow = new Date(currNow.getTime() + 2 * 60000);
        setScheduledHour(String(futureNow.getHours()).padStart(2, '0'));
        setScheduledMinute(String(futureNow.getMinutes()).padStart(2, '0'));
      }
    }
  }, [scheduledDate, scheduledHour, scheduledMinute]);

  useEffect(() => {
    const prefilledUrl = localStorage.getItem('prefilledVideoUrl');
    const prefilledThumb = localStorage.getItem('prefilledThumbnailUrl');
    
    if (prefilledUrl) {
      setVideoUrl(prefilledUrl);
      setVideoPreviewUrl(prefilledUrl);
      setIsLoaded(true);
      localStorage.removeItem('prefilledVideoUrl');
      
      if (prefilledThumb) {
        setSelectedThumbnail(prefilledThumb);
        setThumbnails([prefilledThumb]);
        localStorage.removeItem('prefilledThumbnailUrl');
      }
    }
  }, []);

  const fetchFbStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/fb/status`);
      if (response.ok) {
        const data = await response.json();
        setFbStatus(data);
        if (data.app_id) {
          setFbAppId(data.app_id);
        }
        if (data.app_secret_set) {
          setFbAppSecret('••••••••••••••••');
        } else {
          setFbAppSecret('');
        }
        if (data.connected) {
          setFacebookAccount(data.user_name);
          if (data.pages && data.pages.length > 0) {
            setFacebookPage(prev => {
              const exists = data.pages.some(p => String(p.id) === String(prev));
              return exists ? prev : data.pages[0].id;
            });
          }
        }
      }
    } catch (e) {
      console.error("Error fetching FB status:", e);
    }
  };

  const startFbOauthFlow = async () => {
    // Empty App ID/Secret defaults to Simulated/Sandbox Login on the backend
    setIsConnectingFb(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fb/start_oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: fbAppId,
          appSecret: fbAppSecret === '••••••••••••••••' ? '' : fbAppSecret
        })
      });
      const data = await response.json();
      if (response.ok) {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        const oauthWindow = window.open(
          data.oauth_url,
          'Facebook Login',
          `width=${width},height=${height},top=${top},left=${left}`
        );

        // Poll API status every 2 seconds
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE_URL}/api/fb/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.connected) {
                clearInterval(pollInterval);
                setFbStatus(statusData);
                setFacebookAccount(statusData.user_name);
                if (statusData.pages && statusData.pages.length > 0) {
                  setFacebookPage(statusData.pages[0].id);
                }
                setShowConnectModal(false);
                setIsConnectingFb(false);
                alert("Facebook Account connected successfully!");
                if (oauthWindow && !oauthWindow.closed) {
                  oauthWindow.close();
                }
              }
            }
          } catch (err) {
            console.error("Polling status error:", err);
          }
        }, 2000);

        // Check if window closed without completing
        const checkClosed = setInterval(() => {
          if (oauthWindow && oauthWindow.closed) {
            clearInterval(checkClosed);
            clearInterval(pollInterval);
            setIsConnectingFb(false);
            // Final check
            fetchFbStatus();
          }
        }, 1000);
      } else {
        alert(data.detail || "Failed to initiate OAuth flow");
        setIsConnectingFb(false);
      }
    } catch (e) {
      alert("Error: " + e.message);
      setIsConnectingFb(false);
    }
  };

  const handleConnectFb = async (token = null) => {
    const tokenToUse = token || fbAccessTokenInput;
    if (!tokenToUse) {
      alert("Please enter an Access Token");
      return;
    }
    setIsConnectingFb(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fb/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: tokenToUse })
      });
      const data = await response.json();
      if (response.ok) {
        setFbStatus(data);
        setFacebookAccount(data.user_name);
        if (data.pages && data.pages.length > 0) {
          setFacebookPage(data.pages[0].id);
        }
        setShowConnectModal(false);
        setFbAccessTokenInput('');
        alert("Facebook Account connected!");
      } else {
        alert(data.detail || "Connection failed");
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsConnectingFb(false);
    }
  };

  const handleDisconnectFb = async () => {
    if (!confirm("Are you sure you want to disconnect Facebook account?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/fb/disconnect`, { method: 'POST' });
      if (response.ok) {
        setFbStatus({ connected: false, user_name: '', user_id: '', pages: [] });
        setFacebookAccount('');
        setFacebookPage('');
        alert("Disconnected!");
      }
    } catch (e) {
      alert("Disconnect failed: " + e.message);
    }
  };

  const formatScheduledDateTime = () => {
    if (!scheduledDate || scheduledHour === '' || scheduledMinute === '') return 'No schedule selected — publish now';
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

  const handleCustomThumbnailUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result;
      const newCustomThumbs = [base64Url, ...customThumbnails];
      setCustomThumbnails(newCustomThumbs);
      localStorage.setItem('customThumbnails', JSON.stringify(newCustomThumbs));
      setSelectedThumbnail(base64Url);
    };
    reader.readAsDataURL(file);
  };

  const deleteCustomThumbnail = (e, thumbUrl) => {
    e.stopPropagation();
    const updated = customThumbnails.filter(t => t !== thumbUrl);
    setCustomThumbnails(updated);
    localStorage.setItem('customThumbnails', JSON.stringify(updated));
    if (selectedThumbnail === thumbUrl) {
      setSelectedThumbnail(updated[0] || thumbnails[0] || '');
    }
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

  const todayISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const scheduledTime = getScheduledTime();
  const isScheduleActive = Boolean(scheduledTime) && isFutureDateTime(scheduledTime);
  const isSchedulePast = Boolean(scheduledTime) && !isFutureDateTime(scheduledTime);
  const submitButtonText = isLoading
    ? (isScheduleActive ? 'Scheduling...' : 'Uploading...')
    : (isScheduleActive ? 'Schedule & Upload Post' : 'Upload Now');

  const clearSchedule = () => {
    setScheduledDate('');
    setScheduledHour('');
    setScheduledMinute('');
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
    <div className="dashboard-container">
      <div className="dashboard-grid">
        {/* Left Column: Form Section */}
        <div className="dashboard-editor-col">
          <div className="form-section" id="pe-post">
            <h2>Facebook Account & Page</h2>
            <div className="input-group">
              <label>Account Connection:</label>
              {fbStatus.connected ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: '700', color: '#10b981', flex: 1 }}>
                     🟢 {fbStatus.user_name}
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnectFb}
                    className="add-account-btn"
                    style={{ width: 'auto', padding: '8px 12px', borderStyle: 'solid', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConnectModal(true)}
                  className="add-account-btn"
                >
                  + Link Facebook Account
                </button>
              )}
            </div>
            
            <div className="input-group">
              <label>Publish to Page:</label>
              {fbStatus.connected ? (
                (fbStatus.pages || []).length > 0 ? (
                  <select
                    value={facebookPage}
                    onChange={(e) => {
                      setFacebookPage(e.target.value);
                      // Set page name as well if needed
                      const pg = (fbStatus.pages || []).find(p => String(p.id) === String(e.target.value));
                      if (pg) {
                        setFacebookAccount(fbStatus.user_name);
                      }
                    }}
                    className="video-url-input"
                    style={{ background: 'var(--bg-input)', cursor: 'pointer' }}
                  >
                    {(fbStatus.pages || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="thumbnail-error">No pages found on this Facebook account.</div>
                )
              ) : (
                <div className="page-dropdown" onClick={() => setShowConnectModal(true)}>
                  <span className="page-flag">🏁</span>
                  <span className="page-text" style={{ color: 'var(--text-secondary)' }}>Link account to select page</span>
                  <span className="page-arrow">▼</span>
                </div>
              )}
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


          <div className="form-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Select Thumbnail</h2>
              <label htmlFor="custom-thumbnail-upload" className="custom-thumbnail-upload-label" style={{ cursor: 'pointer' }}>
                📁 Upload Custom Image
              </label>
              <input
                id="custom-thumbnail-upload"
                type="file"
                accept="image/*"
                onChange={handleCustomThumbnailUpload}
                hidden
              />
            </div>
            
            {(thumbnails.length > 0 || customThumbnails.length > 0) ? (
              <div className="thumbnail-scroll">
                {customThumbnails.map((thumbnailUrl, index) => (
                  <div key={thumbnailUrl} style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectThumbnail(thumbnailUrl)}
                      className={`thumbnail-button${selectedThumbnail === thumbnailUrl ? ' thumbnail-button--selected' : ''}`}
                    >
                      <img src={thumbnailUrl} alt={`Custom ${index + 1}`} className="thumbnail-image" />
                    </button>
                    <button
                      type="button"
                      className="custom-thumbnail-delete-btn"
                      onClick={(e) => deleteCustomThumbnail(e, thumbnailUrl)}
                      title="Delete custom thumbnail"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  OR
                </div>
                
                <label 
                  htmlFor="custom-thumbnail-upload" 
                  className="custom-thumbnail-placeholder-upload-btn"
                >
                  📁 Select Image From Device
                </label>
              </div>
            )}
            {extractError && (
              <p className="thumbnail-error">ERROR: Cannot read image. Please try again or contact support.</p>
            )}
          </div>

          <div className="form-section">
            <h2>Facebook Preview</h2>
            <FacebookPreview
              pageName={(fbStatus.pages || []).find(p => String(p.id) === String(facebookPage))?.name || 'Page Name'}
              caption={caption}
              videoSrc={videoPreviewUrl}
              selectedThumbnail={selectedThumbnail}
              onCaptionChange={setCaption}
              ctaText={ctaText}
              onCtaTextChange={setCtaText}
            />
          </div>

          <div className="form-section schedule-section">
            <div className="schedule-panel">
              <div className="schedule-panel-top">
                <div>
                  <span className="schedule-panel-kicker">Publish timing</span>
                  <h2>Schedule Post</h2>
                  <p>
                    {isScheduleActive
                      ? 'Your post is ready to be scheduled for the selected future time.'
                      : isSchedulePast
                        ? 'Choose a future time before scheduling this post.'
                        : 'Pick a future time now, or leave this empty to publish immediately.'}
                  </p>
                </div>
                <span className={`schedule-status${isScheduleActive ? ' schedule-status--active' : isSchedulePast ? ' schedule-status--warning' : ' schedule-status--idle'}`}>
                  {isScheduleActive ? 'Scheduled' : isSchedulePast ? 'Past time' : 'Publish now'}
                </span>
              </div>

              <div className="schedule-input-grid">
                <label className="schedule-input-card">
                  <span>Date</span>
                  <input
                    type="date"
                    className="schedule-date-input"
                    value={scheduledDate}
                    min={todayISO}
                    onChange={(event) => setScheduledDate(event.target.value)}
                  />
                </label>
                <label className="schedule-input-card">
                  <span>Time</span>
                  <input
                    type="time"
                    className="schedule-time-input"
                    value={`${scheduledHour}:${scheduledMinute}`}
                    onChange={(event) => {
                      const [hour = '00', minute = '00'] = event.target.value.split(':');
                      setScheduledHour(hour);
                      setScheduledMinute(minute);
                    }}
                  />
                </label>
              </div>

              <div className="schedule-selected-card">
                <span>Selected time</span>
                <strong>{formatScheduledDateTime()}</strong>
              </div>

              <div className="schedule-actions">
                <button type="button" className="clear-schedule-btn" onClick={clearSchedule}>
                  Clear schedule
                </button>
                <button
                  type="button"
                  className="calendar-trigger-btn"
                  onClick={() => setShowCalendar(true)}
                >
                  Open calendar
                </button>
              </div>
            </div>

            <div className="button-group">
              <button
                type="button"
                onClick={handleUploadNow}
                className="upload-now-btn"
                disabled={isLoading}
              >
                {submitButtonText}
              </button>
            </div>

            {showCalendar && (
              <div className="calendar-modal">
                <DateTimePicker
                  value={`${scheduledDate}T${scheduledHour}:${scheduledMinute}`}
                  onChange={(dateTime) => {
                    const selected = typeof dateTime === 'string' ? dateTime : dateTime?.toISOString?.() || '';
                    if (!selected) return;
                    const [date, time] = selected.split('T');
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
      </div>

      {/* Facebook Access Token Connection Modal */}
      {showConnectModal && (
        <div className="pe-modal-overlay">
          <div className="pe-modal-box" style={{ width: '550px' }}>
            <div className="pe-modal-header">
              <h2>Connect Facebook Account</h2>
              <button type="button" className="close-modal-btn" onClick={() => setShowConnectModal(false)}>✕</button>
            </div>
            
            <div className="pe-modal-body">
              {!showAdvancedSettings ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '10px 0' }}>
                  <p className="pe-modal-desc" style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#cbd5e1' }}>
                    Click the button below to log in and link your Facebook account. 
                    This will automatically discover and load all the Pages you manage.
                  </p>

                  <button
                    type="button"
                    className="modal-btn modal-btn--connect-oauth"
                    onClick={startFbOauthFlow}
                    disabled={isConnectingFb}
                    style={{ 
                      padding: '14px', 
                      fontSize: '1rem', 
                      background: 'linear-gradient(135deg, #1877f2, #3b82f6)',
                      boxShadow: '0 4px 15px rgba(24, 119, 242, 0.25)',
                      borderRadius: '12px'
                    }}
                  >
                    {isConnectingFb ? 'Connecting via Facebook...' : '🔵 Log In with Facebook'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      marginTop: '8px',
                      display: 'inline-block'
                    }}
                  >
                    ⚙️ Show Advanced Developer Settings
                  </button>
                </div>
              ) : (
                <>
                  {/* Tab Selector */}
                  <div className="modal-tabs">
                    <button
                      type="button"
                      className={`modal-tab-btn ${connectTab === 'oauth' ? 'active' : ''}`}
                      onClick={() => setConnectTab('oauth')}
                    >
                      🔑 Official Login (OAuth)
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${connectTab === 'token' ? 'active' : ''}`}
                      onClick={() => setConnectTab('token')}
                    >
                      📝 Manual Access Token
                    </button>
                  </div>

                  {connectTab === 'oauth' ? (
                    <>
                      <p className="pe-modal-desc">
                        Connect your Facebook profile and pages securely using OAuth 2.0 via your Facebook Developer App.
                      </p>

                      <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>Facebook App ID (Optional for Sandbox):</label>
                            <input
                              type="text"
                              value={fbAppId}
                              onChange={(e) => setFbAppId(e.target.value)}
                              placeholder="Leave empty for Demo Mode"
                              className="modal-input-field"
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>Facebook App Secret (Optional):</label>
                            <input
                              type="password"
                              value={fbAppSecret}
                              onChange={(e) => setFbAppSecret(e.target.value)}
                              placeholder="Leave empty for Demo Mode"
                              className="modal-input-field"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="whitelist-card">
                        <div className="whitelist-header">
                          <span className="whitelist-label">OAuth Redirect URI</span>
                          <button
                            type="button"
                            className="whitelist-copy-btn"
                            onClick={() => {
                              const uri = `${API_BASE_URL}/api/fb/callback`;
                              navigator.clipboard.writeText(uri);
                              alert("Redirect URI copied to clipboard!");
                            }}
                          >
                            📋 Copy URI
                          </button>
                        </div>
                        <p className="pe-modal-desc" style={{ fontSize: '0.8rem', color: '#93c5fd', margin: '2px 0' }}>
                          Add this exact URI to your Facebook Developer App under <strong>Facebook Login &gt; Settings &gt; Valid OAuth Redirect URIs</strong>:
                        </p>
                        <div className="whitelist-uri-box">
                          {`${API_BASE_URL}/api/fb/callback`}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="modal-btn modal-btn--connect-oauth"
                        onClick={startFbOauthFlow}
                        disabled={isConnectingFb}
                        style={{ marginTop: '10px', padding: '12px' }}
                      >
                        {isConnectingFb ? 'Connecting via Facebook...' : '🔵 Login & Authorize with Facebook'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="pe-modal-desc">
                        Paste a <strong>Facebook Graph User Access Token</strong> directly to link your profile. 
                        The token must have permissions: <code>pages_show_list</code>, <code>pages_read_engagement</code>, and <code>pages_manage_posts</code>.
                      </p>
                      
                      <div className="input-group">
                        <label>Facebook Access Token:</label>
                        <textarea
                          value={fbAccessTokenInput}
                          onChange={(e) => setFbAccessTokenInput(e.target.value)}
                          placeholder="Paste Facebook EAAG... Token here"
                          rows="4"
                          className="token-textarea"
                        />
                      </div>

                      <div className="dev-links">
                        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
                          ↗ Open Facebook Graph API Explorer
                        </a>
                      </div>
                    </>
                  )}

                  <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSettings(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      ⚙️ Hide Advanced Settings (Back to Simple Mode)
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="pe-modal-footer">
              <button
                type="button"
                className="modal-btn modal-btn--sandbox"
                onClick={() => {
                  const mockToken = "EAAGzD123_MOCK_TOKEN_EAAgzd123";
                  handleConnectFb(mockToken);
                }}
                disabled={isConnectingFb}
              >
                Use Demo Account (Sandbox)
              </button>
              
              <div className="modal-right-btns">
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  onClick={() => setShowConnectModal(false)}
                >
                  Cancel
                </button>
                {connectTab === 'token' && (
                  <button
                    type="button"
                    className="modal-btn modal-btn--connect"
                    onClick={() => handleConnectFb()}
                    disabled={isConnectingFb || !fbAccessTokenInput.trim()}
                  >
                    {isConnectingFb ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
