import { useEffect, useState } from 'react';

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
  {
    label: 'Home',
    id: 'home',
  },
  {
    label: 'PE Post',
    id: 'pe-post',
  },
];

const notificationList = [
  {
    id: 1,
    title: 'Profile connected',
    message: 'Your stored email is shown in the header.',
  },
  {
    id: 2,
    title: 'Ready to schedule',
    message: 'Add your social media accounts and publish posts when ready.',
  },
];

export default function Header({ activePage = 'home', onNavigate }) {
  const [email, setEmail] = useState(readStoredEmail);
  const [notifications, setNotifications] = useState(notificationList);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
    const closeDropdowns = (event) => {
      if (!event.target.closest('.header-actions')) {
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
    <header className="dashboard-header">
      <div className="dashboard-header-row">
        <div className="dashboard-header-title">
          <h1>Zen Post</h1>
          <p>Plan, preview, and publish with confidence</p>
        </div>

        <div className="header-actions">
          <div className="notification-wrap">
            <button
              type="button"
              className="header-icon-button notification-button"
              aria-label="Show notifications"
              aria-expanded={showNotifications}
              onClick={() => {
                setShowNotifications((open) => !open);
                setShowProfile(false);
              }}
            >
              <svg className="header-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 21h4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="notification-badge">{unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown" role="menu">
                <div className="notification-dropdown-header">
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    className="notification-clear-btn"
                    onClick={() => setNotifications([])}
                  >
                    Mark all read
                  </button>
                </div>

                {notifications.length > 0 ? (
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <div key={notification.id} className="notification-item">
                        <span className="notification-dot" />
                        <div>
                          <strong>{notification.title}</strong>
                          <span>{notification.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="notification-empty">No new notifications</div>
                )}
              </div>
            )}
          </div>

          <div className="profile-wrap">
            <button
              type="button"
              className="profile-pill"
              aria-label="Show profile menu"
              aria-expanded={showProfile}
              onClick={() => {
                setShowProfile((open) => !open);
                setShowNotifications(false);
              }}
            >
              <div className="profile-avatar">{initials}</div>
              <div className="profile-info">
                <span className="profile-label">Profile</span>
                <span className="profile-email">{email || 'Not signed in'}</span>
              </div>
            </button>

            {showProfile && (
              <div className="profile-dropdown" role="menu" aria-label="Profile menu">
                <div className="profile-dropdown-header">
                  <div className="profile-dropdown-avatar">{initials}</div>
                  <div>
                    <strong>Profile</strong>
                    <span>{email || 'Not signed in'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="profile-dropdown-action profile-dropdown-action--danger"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="header-menu" aria-label="Primary menu">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`header-menu-item${activePage === item.id ? ' header-menu-item--active' : ''}`}
            onClick={() => handleMenuClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
