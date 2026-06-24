import './Home.css';

const features = [
  {
    title: 'Video Post Builder',
    description: 'Load a video URL or upload a video, then preview it before publishing.',
  },
  {
    title: 'Smart Caption Flow',
    description: 'Write your caption manually or keep the generated text and edit it quickly.',
  },
  {
    title: 'Thumbnail Choice',
    description: 'Pick the best frame so your social post looks polished and ready.',
  },
  {
    title: 'Schedule Publishing',
    description: 'Choose a date and time, then upload your prepared post when ready.',
  },
];

export default function Home({ onOpenPost, onOpenPowerEditor, onOpenDownloader }) {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-eyebrow">Zen Post App</span>
          <h1>Plan, preview, and publish posts with confidence.</h1>
          <p>
            Build your post, add a caption, choose a thumbnail, verify Facebook account connection, and schedule publishing from one focused workspace.
          </p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary-btn" onClick={onOpenPost}>
              Create PE Post
            </button>
            <button type="button" className="home-primary-btn" style={{ background: 'var(--success-color)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }} onClick={onOpenPowerEditor}>
              Power Editor
            </button>
            <button type="button" className="home-secondary-btn" onClick={onOpenDownloader}>
              Downloader Hub
            </button>
          </div>
        </div>

        <div className="home-preview-card" aria-label="Post builder preview">
          <div className="home-preview-top">
            <span>Post Builder</span>
            <strong>Ready</strong>
          </div>
          <div className="home-preview-media">
            <div className="home-preview-play">▶</div>
          </div>
          <div className="home-preview-caption">
            <span>Caption preview</span>
            <p>Your post caption will appear here before you publish.</p>
          </div>
          <div className="home-preview-grid">
            <span>Video</span>
            <span>Thumbnail</span>
            <span>Schedule</span>
          </div>
        </div>
      </section>

      <section className="home-features" id="features">
        <div className="home-section-heading">
          <span>Workflow</span>
          <h2>Everything you need for one clean social post.</h2>
        </div>
        <div className="home-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="home-feature-card">
              <span className="home-feature-icon">{feature.title.slice(0, 1)}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
