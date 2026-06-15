import './FacebookPreview.css';

export default function FacebookPreview({ pageName, caption, videoSrc, ctaText, selectedThumbnail }) {
  const displayCaption = caption || 'Caption loading...';
  const displayPageName = pageName || 'Page Name';
  const displayCtaText = ctaText || 'CTA Text...';

  return (
    <div className="facebook-preview-wrapper">
      <article className="facebook-preview-card" aria-label="Facebook Preview">
        <div className="facebook-preview-header">
          <h3>FaceBook Preview</h3>
        </div>

        <div className="facebook-preview-account">
          <span className="facebook-preview-avatar">(PF)</span>
          <span className="facebook-preview-page-name">{displayPageName}</span>
        </div>

        <p className="facebook-preview-caption">{displayCaption}</p>

        <div className="facebook-preview-media-grid">
          <div className="facebook-preview-video-box">
            {videoSrc ? (
              <video
                src={videoSrc}
                className="facebook-preview-video"
                controls
                muted
                playsInline
              />
            ) : (
              <span className="facebook-preview-video-placeholder">Video Loading...</span>
            )}
            <span className="facebook-preview-card-label">{displayCtaText}</span>
          </div>

          <button type="button" className="facebook-preview-add-card">
            {selectedThumbnail ? (
              <>
                <img src={selectedThumbnail} alt="Selected thumbnail" className="facebook-preview-thumbnail" />
                <span className="facebook-preview-card-label">{displayCtaText}</span>
              </>
            ) : (
              <>
                <span className="facebook-preview-add-icon">+</span>
                <span>Add Card</span>
                <span className="facebook-preview-card-label">{displayCtaText}</span>
              </>
            )}
          </button>
        </div>
      </article>
    </div>
  );
}
