import React, { useState, useEffect } from 'react';
import './Downloader.css';

export default function Downloader({ onOpenPost }) {
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadFormat, setDownloadFormat] = useState('mp4');
  const [saveFolder, setSaveFolder] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [completedDownload, setCompletedDownload] = useState(null);
  const [downloadHistory, setDownloadHistory] = useState([]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? "http://localhost:10000" 
      : "https://zen-post-1.onrender.com");

  const fetchDownloads = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/downloads`);
      if (response.ok) {
        const data = await response.json();
        setDownloadHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
    }
  };

  const handleOpenFolder = async (item) => {
    try {
      const path = item.saved_path || item.filename;
      await fetch(`${API_BASE_URL}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path })
      });
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const handleDownload = async (e) => {
    e.preventDefault();
    if (!downloadUrl.trim()) return;

    setIsDownloading(true);
    setDownloadPercent(0);
    setDownloadMessage('Initializing download...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: downloadUrl, 
          format: downloadFormat,
          save_folder: saveFolder.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Download failed to start.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.status === 'downloading') {
              setDownloadPercent(data.percent);
              setDownloadMessage(`Downloading...`);
            } else if (data.status === 'processing') {
              setDownloadPercent(99);
              setDownloadMessage('Processing media (FFmpeg conversion)...');
            } else if (data.status === 'success') {
              setDownloadPercent(100);
              setDownloadMessage(`Success! Saved download: "${data.download.title}"`);
              setDownloadUrl('');
              setCompletedDownload(data.download);
              setShowSuccessAlert(true);
              fetchDownloads();
            } else if (data.status === 'error') {
              setDownloadMessage(`ERROR: ${data.message || 'Download failed.'}`);
            }
          } catch (err) {
            console.error('Failed to parse line:', line, err);
          }
        }
      }
    } catch (error) {
      setDownloadMessage(`ERROR: ${error.message || 'Network error. Failed to connect to server.'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteDownload = async (id) => {
    if (!confirm('Are you sure you want to delete this downloaded file?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/downloads/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchDownloads(); // Refresh history
      }
    } catch (error) {
      console.error('Failed to delete download:', error);
    }
  };

  const handleChooseFolder = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/choose-folder`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.folder) {
          setSaveFolder(data.folder);
        }
      }
    } catch (error) {
      console.error('Failed to choose folder:', error);
    }
  };

  const useInBuilder = (item) => {
    localStorage.setItem('prefilledVideoUrl', item.file_url);
    if (item.thumbnail_url && !item.thumbnail_url.includes('data:image')) {
      localStorage.setItem('prefilledThumbnailUrl', item.thumbnail_url);
    }
    onOpenPost(); // Navigate to PE Post page
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchDownloads();
  }, []);

  return (
    <div className="downloader-page-container">
      <section className="downloader-section form-section" style={{ maxWidth: '850px', margin: '160px auto 80px auto' }}>
        <div className="downloader-header">
          <h2>Zen Downloader</h2>
          <p className="downloader-subtitle">
            Paste a link to download MP4 video files or extract MP3 audio. Enter a folder path on your computer below to choose where to save the files!
          </p>
        </div>

        <form onSubmit={handleDownload} className="downloader-form">
          {/* URL Input */}
          <div className="downloader-input-wrap">
            <input
              type="text"
              placeholder="Paste video or audio URL link here (YouTube, TikTok...)..."
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              className="downloader-input"
              disabled={isDownloading}
            />
            <button
              type="submit"
              className="downloader-submit-btn"
              disabled={isDownloading || !downloadUrl.trim()}
            >
              {isDownloading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="spinner" />
                  <span>{downloadPercent > 0 ? `Downloading ${downloadPercent}%` : "Downloading..."}</span>
                </div>
              ) : (
                "Download"
              )}
            </button>
          </div>

          {/* Custom Save Folder Directory Path */}
          <div className="downloader-folder-input-group">
            <label className="downloader-folder-label">Custom Save Folder Path (Optional):</label>
            <div className="downloader-folder-row">
              <input
                type="text"
                placeholder="e.g. C:\Users\Chansokpheaktra_Phy\Downloads or D:\MyVideos..."
                value={saveFolder}
                onChange={(e) => setSaveFolder(e.target.value)}
                className="downloader-folder-input"
                disabled={isDownloading}
              />
              <button
                type="button"
                onClick={handleChooseFolder}
                className="downloader-browse-btn"
                disabled={isDownloading}
                title="Browse folder on your computer"
              >
                📁 Choose Folder...
              </button>
            </div>
            <p className="downloader-folder-hint">
              Click "Choose Folder..." or paste a local path to save a copy of the downloaded media files to that folder.
            </p>
          </div>

          {/* Media Format Radio Buttons */}
          <div className="downloader-format-options">
            <label className={`format-option ${downloadFormat === 'mp4' ? 'format-option--active' : ''}`}>
              <input
                type="radio"
                name="format"
                value="mp4"
                checked={downloadFormat === 'mp4'}
                onChange={() => setDownloadFormat('mp4')}
                hidden
              />
              <span className="format-option-icon">🎥</span>
              <div className="format-option-info">
                <strong>MP4 Video</strong>
                <span>Download High Quality MP4</span>
              </div>
            </label>

            <label className={`format-option ${downloadFormat === 'mp3' ? 'format-option--active' : ''}`}>
              <input
                type="radio"
                name="format"
                value="mp3"
                checked={downloadFormat === 'mp3'}
                onChange={() => setDownloadFormat('mp3')}
                hidden
              />
              <span className="format-option-icon">🎵</span>
              <div className="format-option-info">
                <strong>MP3 Audio</strong>
                <span>Extract clean audio MP3</span>
              </div>
            </label>
          </div>
        </form>

        {isDownloading && (
          <div className="downloader-progress-container">
            <div className="downloader-progress-track">
              <div 
                className="downloader-progress-bar" 
                style={{ width: `${downloadPercent}%` }} 
              />
            </div>
            <div className="downloader-progress-label">
              <span>{downloadMessage}</span>
              <span className="progress-percent-text">{downloadPercent}%</span>
            </div>
          </div>
        )}

        {!isDownloading && downloadMessage && (
          <div className={`downloader-message ${downloadMessage.startsWith('ERROR') ? 'downloader-message--error' : 'downloader-message--success'}`}>
            {downloadMessage}
          </div>
        )}

        {/* DOWNLOADED HISTORY GALLERY */}
        <div className="downloads-history-container">
          <h3>Recent Downloads</h3>
          
          {downloadHistory.length === 0 ? (
            <div className="downloader-empty-history">
              <span className="history-empty-icon">📂</span>
              <p>No downloads yet. Paste a link above to start downloading media.</p>
            </div>
          ) : (
            <div className="downloads-grid">
              {downloadHistory.map((item) => (
                <div key={item.id} className="download-item-card">
                  <div className="download-item-thumbnail-wrap">
                    {item.format === 'mp3' ? (
                      <div className="download-item-audio-placeholder">
                        <span className="audio-music-icon">🎵</span>
                        <span className="audio-music-sub">MP3 Audio</span>
                      </div>
                    ) : item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt={item.title} className="download-item-thumbnail" />
                    ) : (
                      <div className="download-item-video-placeholder">
                        <span>🎥</span>
                      </div>
                    )}
                    <span className="download-item-badge">{item.format.toUpperCase()}</span>
                  </div>

                  <div className="download-item-details">
                    <h4 className="download-item-title" title={item.title}>
                      {item.title}
                    </h4>
                    
                    <div className="download-item-meta">
                      {item.duration && (
                        <span className="meta-badge">
                          ⏱️ {formatDuration(item.duration)}
                        </span>
                      )}
                      <span className="meta-badge meta-badge--date">
                        📅 {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="download-item-actions">
                      {item.format === 'mp4' ? (
                        <button
                          type="button"
                          className="download-action-btn download-action-btn--use"
                          onClick={() => useInBuilder(item)}
                        >
                          Use in Post Builder
                        </button>
                      ) : (
                        <a
                          href={item.file_url}
                          download={item.filename}
                          className="download-action-btn download-action-btn--download-audio"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          Save Audio File
                        </a>
                      )}
                      <button
                        type="button"
                        className="download-action-btn download-action-btn--delete"
                        onClick={() => handleDeleteDownload(item.id)}
                        title="Delete download file"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showSuccessAlert && completedDownload && (
        <div className="downloader-modal-backdrop">
          <div className="downloader-modal-card">
            <div className="downloader-modal-header">
              <span className="downloader-modal-icon">🎉</span>
              <h3>Download Complete!</h3>
            </div>
            
            <div className="downloader-modal-body">
              <p className="downloader-modal-filename" title={completedDownload.title}>
                {completedDownload.title}
              </p>
              <p className="downloader-modal-dest">
                Saved to: <span>{completedDownload.saved_path || "Default downloads folder"}</span>
              </p>
            </div>
            
            <div className="downloader-modal-footer">
              <button 
                type="button" 
                className="downloader-modal-btn downloader-modal-btn--open"
                onClick={() => {
                  handleOpenFolder(completedDownload);
                  setShowSuccessAlert(false);
                }}
              >
                📁 Show Folder
              </button>
              <button 
                type="button" 
                className="downloader-modal-btn downloader-modal-btn--cancel"
                onClick={() => setShowSuccessAlert(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
