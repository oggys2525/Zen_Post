import React, { useState, useRef, useEffect } from 'react';
import './FacebookPreview.css';

export default function FacebookPreview({ pageName, caption, videoSrc, ctaText, selectedThumbnail, onCaptionChange, onCtaTextChange }) {
  const displayCaption = caption || 'Caption loading...';
  const displayPageName = pageName || 'Page Name';
  const displayCtaText = ctaText || 'Support page Share & Follow';

  const [currentSlide, setCurrentSlide] = useState(0);

  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false); // Starts unmuted by default
  const [volume, setVolume] = useState(0.8);

  // Sync volume and mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  // Auto-play trigger when video source changes with standard browser sound fallback
  useEffect(() => {
    if (videoRef.current && isPlaying) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Autoplay with sound blocked, playing muted:", error);
          setIsMuted(true);
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [videoSrc, isPlaying]);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds === 0) return '0:00';
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsMuted(false); // Explicit play click should unmute so they hear the sound
    } else {
      videoRef.current.pause();
    }
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    const newMuted = !videoRef.current.muted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    // If we unmute and volume is 0, give it some volume so they hear sound
    if (!newMuted && volume === 0) {
      setVolume(0.8);
      videoRef.current.volume = 0.8;
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val > 0) {
        videoRef.current.muted = false;
        setIsMuted(false);
      } else {
        videoRef.current.muted = true;
        setIsMuted(true);
      }
    }
  };

  const handleFullscreenToggle = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    } else if (videoRef.current.webkitRequestFullscreen) {
      videoRef.current.webkitRequestFullscreen();
    } else if (videoRef.current.msRequestFullscreen) {
      videoRef.current.msRequestFullscreen();
    }
  };

  const handleProgressBarClick = (e) => {
    if (!videoRef.current || !progressBarRef.current || duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const clickPercent = Math.max(0, Math.min(1, clickX / width));
    videoRef.current.currentTime = clickPercent * duration;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // A cute base64 mock bunny image mimicking the headphones bunny in the user's screenshot
  const mockBunnyImage = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' width='100%25' height='100%25'><rect width='100%25' height='100%25' fill='%23f1f3f5'/><ellipse cx='200' cy='240' rx='90' ry='80' fill='%23ffffff' stroke='%23dee2e6' stroke-width='4'/><ellipse cx='150' cy='120' rx='25' ry='60' fill='%23ffffff' stroke='%23dee2e6' stroke-width='4' transform='rotate(-5, 150, 120)'/><ellipse cx='250' cy='120' rx='25' ry='60' fill='%23ffffff' stroke='%23dee2e6' stroke-width='4' transform='rotate(5, 250, 120)'/><circle cx='165' cy='220' r='8' fill='%23212529'/><circle cx='235' cy='220' r='8' fill='%23212529'/><path d='M190 240 L210 240 M200 240 L200 250 M190 255 Q200 262 210 255' stroke='%23212529' stroke-width='3' fill='none'/><path d='M110 220 A 100 100 0 0 1 290 220' fill='none' stroke='%236c757d' stroke-width='14' stroke-linecap='round'/><rect x='80' y='200' width='34' height='50' rx='10' fill='%23adb5bd'/><rect x='286' y='200' width='34' height='50' rx='10' fill='%23adb5bd'/></svg>";

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? 1 : 0));
  };

  const LikeThumbsUpIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="#1877f2" style={{ flexShrink: 0, marginLeft: '6px' }}>
      <path d="M14.6 8H21a2 2 0 0 1 2 2v2.1a2 2 0 0 1-.5 1.4l-4.5 5.3a2 2 0 0 1-1.5.7H8V8l5.3-5.3A1 1 0 0 1 14 3a1 1 0 0 1 1 1v4h-.4zM6 8H2v10h4V8z" />
    </svg>
  );

  return (
    <div className="facebook-preview-wrapper">
      <article className="facebook-preview-card" aria-label="Facebook Preview">
        
        {/* Header Kicker */}
        <div className="facebook-preview-header">
          <span className="fb-preview-badge">Page Likes Ad Preview</span>
        </div>

        {/* Facebook Page Profile Row */}
        <div className="fb-profile-row">
          <div className="fb-profile-avatar">
            {displayPageName.slice(0, 2).toUpperCase()}
          </div>
          <div className="fb-profile-text">
            <span className="fb-profile-name">{displayPageName}</span>
            <div className="fb-profile-sub">
              <span>Sponsored</span>
              <span className="fb-bullet">•</span>
              <span className="fb-globe-icon">🌎</span>
            </div>
          </div>
          <button type="button" className="fb-more-options">•••</button>
        </div>

        {/* Caption */}
        {onCaptionChange ? (
          <textarea
            className="fb-caption-textarea"
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Write your caption here..."
          />
        ) : (
          <p className="fb-caption-text">{displayCaption}</p>
        )}

        {/* Carousel Visual Frame */}
        <div className="fb-carousel-viewport">
          <div className="fb-carousel-slider">
            
            {/* Card 1: Video Card with Mock Controls */}
            <div className="fb-carousel-card">
              <div className="fb-card-media-box">
                {videoSrc ? (
                  <>
                    <video
                      ref={videoRef}
                      src={videoSrc}
                      className="fb-video-element"
                      defaultMuted
                      playsInline
                      loop
                      autoPlay
                      onClick={handlePlayPause}
                      style={{ cursor: 'pointer' }}
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setCurrentTime(videoRef.current.currentTime);
                        }
                      }}
                      onLoadedMetadata={() => {
                        if (videoRef.current) {
                          setDuration(videoRef.current.duration);
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                    
                    {/* Float Sound Controls in the top-right corner of the video */}
                    <div className="fb-video-top-right-controls">
                      <button type="button" className="fb-ctrl-sound-btn" onClick={handleMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>
                        {isMuted ? '🔇' : '🔊'}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="fb-volume-slider-top"
                        aria-label="Volume Slider"
                      />
                    </div>
                  </>
                ) : (
                  <div className="fb-video-placeholder">
                    <span className="fb-video-placeholder-icon">▶</span>
                    <span>Video Loading...</span>
                  </div>
                )}

                {/* Video Player Control Overlay matching screenshot */}
                <div className="fb-video-controls-overlay">
                  <button type="button" className="fb-ctrl-play" onClick={handlePlayPause} aria-label="Play/Pause">
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="white">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  
                  <span className="fb-ctrl-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
                  
                  <div className="fb-ctrl-progress-bar" onClick={handleProgressBarClick} ref={progressBarRef}>
                    <div className="fb-progress-track">
                      <div className="fb-progress-fill" style={{ width: `${progressPercent}%` }} />
                      <div className="fb-progress-thumb" style={{ left: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <button type="button" className="fb-ctrl-icon" aria-label="Settings">
                    ⚙️
                  </button>

                  <button type="button" className="fb-ctrl-icon" onClick={handleFullscreenToggle} aria-label="Fullscreen">
                    ⛶
                  </button>

                  <button type="button" className="fb-ctrl-icon" onClick={handleMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? '🔇' : '🔊'}
                  </button>
                </div>
              </div>
              
              <div className="fb-card-info-box">
                {onCtaTextChange ? (
                  <input
                    type="text"
                    className="fb-card-caption-title-input"
                    value={ctaText}
                    onChange={(e) => onCtaTextChange(e.target.value)}
                    placeholder="Enter CTA text..."
                  />
                ) : (
                  <span className="fb-card-caption-title">{displayCtaText}</span>
                )}
                <LikeThumbsUpIcon />
              </div>
            </div>

            {/* Card 2: Image Card with Bunny / Selected Thumbnail */}
            <div className="fb-carousel-card">
              <div className="fb-card-media-box">
                <img 
                  src={selectedThumbnail || mockBunnyImage} 
                  alt="Carousel Card Visual" 
                  className="fb-card-image-element"
                />
              </div>
              
              <div className="fb-card-info-box">
                <span className="fb-card-caption-title">{displayPageName}</span>
                <LikeThumbsUpIcon />
              </div>
            </div>

          </div>
        </div>

      </article>
    </div>
  );
}
