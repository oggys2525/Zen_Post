import { useEffect, useState } from 'react';
import './Header.css';

const STORAGE_KEYS = [
  'userEmail',
  'email',
  'profileEmail',
  'authEmail',
  'currentUser',
  'user',
  'profile',
  'auth',
];

const getStoredValue = (key) => {
  const value = localStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const getEmailFromValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.includes('@') ? value : '';

  const candidates = [
    value.email,
    value.userEmail,
    value.profileEmail,
    value.username,
    value.user?.email,
    value.profile?.email,
    value.account?.email,
  ];

  return candidates.find((item) => typeof item === 'string' && item.includes('@')) || '';
};

const readStoredEmail = () => {
  for (const key of STORAGE_KEYS) {
    const email = getEmailFromValue(getStoredValue(key));
    if (email) return email;
  }

  return '';
};

const menuItems = [
  { id: 'home', label: 'Home' },
  { id: 'downloader', label: 'Downloader' },
  { id: 'pe-post', label: 'PE Post Builder' },
  { id: 'power-editor', label: 'Power Editor Dashboard' },
];

const notificationList = [
  {
    id: 1,
    title: 'Workspace ready',
    message: 'Your post builder, preview, and schedule tools are connected.',
  },
  {
    id: 2,
    title: 'Publish with confidence',
    message: 'Review captions, thumbnails, and timing before posting.',
  },
];

const BellIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
    <path d="M10 21h4" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function Header({ activePage = 'home', onNavigate }) {
  const [email, setEmail] = useState(readStoredEmail);
  const [notifications, setNotifications] = useState(notificationList);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [navBlur, setNavBlur] = useState(false);

  const handleSignOut = () => {
    STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    setEmail('');
    setShowProfile(false);
  };

  const handleMenuClick = (id) => {
    onNavigate?.(id);
  };

  useEffect(() => {
    const refreshEmail = () => setEmail(readStoredEmail());
    refreshEmail();
    window.addEventListener('storage', refreshEmail);
    const intervalId = setInterval(refreshEmail, 1000);
    return () => {
      window.removeEventListener('storage', refreshEmail);
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setNavBlur(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const closeDropdowns = (event) => {
      if (!event.target.closest('.header-wrapper')) {
        setShowNotifications(false);
        setShowProfile(false);
      }
    };

    const closeDropdownsOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowProfile(false);
      }
    };

    document.addEventListener('mousedown', closeDropdowns);
    document.addEventListener('keydown', closeDropdownsOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeDropdowns);
      document.removeEventListener('keydown', closeDropdownsOnEscape);
    };
  }, []);

  const initials = email
    ? email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 1).toUpperCase() || 'U'
    : 'U';

  const unreadCount = notifications.length;

  return (
    <>
      <header className={`header-wrapper${navBlur ? ' header-wrapper--blur' : ''}`}>
      <div className="header-container">
        {/* Brand Section */}
        <button
          type="button"
          className="header-brand"
          aria-label="Go to Home"
          onClick={() => handleMenuClick('home')}
        >
          <div className="brand-logo">ZP</div>
          <div className="brand-text">
            <h1>Zen Post</h1>
          </div>
        </button>

        {/* Actions Section */}
        <div className="header-actions">
          {/* Create Button */}
          <button
            type="button"
            className="action-btn action-btn--primary"
            title="Create new post"
            onClick={() => handleMenuClick('pe-post')}
          >
            <PlusIcon />
            <span className="action-label">Create</span>
          </button>

          {/* Notifications */}
          <div className="action-dropdown">
            <button
              type="button"
              className="action-btn"
              aria-label={`Notifications${unreadCount > 0 ? `: ${unreadCount} unread` : ''}`}
              aria-expanded={showNotifications}
              aria-haspopup="true"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfile(false);
              }}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="badge">{unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="dropdown-menu notification-dropdown" role="menu">
                <div className="dropdown-header">
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setNotifications([])}
                  >
                    Clear
                  </button>
                </div>

                <div className="dropdown-body">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div key={notification.id} className="notification-item">
                        <div className="notification-dot" />
                        <div className="notification-content">
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">All caught up</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="action-dropdown">
            <button
              type="button"
              className="action-btn action-btn--profile"
              aria-label="Account menu"
              aria-expanded={showProfile}
              aria-haspopup="true"
              onClick={() => {
                setShowProfile(!showProfile);
                setShowNotifications(false);
              }}
            >
              <div className="profile-avatar">{initials}</div>
            </button>

            {showProfile && (
              <div className="dropdown-menu profile-dropdown" role="menu">
                <div className="dropdown-header">
                  <div className="profile-avatar">{initials}</div>
                  <div className="profile-info">
                    <strong>Profile</strong>
                    <span className="profile-email">{email || 'Not signed in'}</span>
                  </div>
                </div>

                <div className="dropdown-body">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => handleMenuClick('pe-post')}
                  >
                    Open PE Post
                  </button>
                  <button
                    type="button"
                    className="dropdown-item dropdown-item--danger"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className={`navbar${navBlur ? ' navbar--blur' : ''}`} aria-label="Primary navigation">
        <div className="navbar-container">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navbar-item ${activePage === item.id ? 'navbar-item--active' : ''}`}
              onClick={() => handleMenuClick(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
    </>
  );
}