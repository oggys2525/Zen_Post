import React, { useEffect, useState, useRef } from 'react';
import './PowerEditor.css';
import FacebookPreview from '../components/FacebookPreview.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import DateTimePicker from '../calendar/Calendar.jsx';

export default function PowerEditor() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? "http://localhost:10000" 
      : "https://zen-post-1.onrender.com");

  const [posts, setPosts] = useState([]);
  const [fbStatus, setFbStatus] = useState({ connected: false, user_name: '', user_id: '', pages: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPostIds, setSelectedPostIds] = useState([]);
  
  // Drawer States
  const [editingPost, setEditingPost] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [editCtaText, setEditCtaText] = useState('Watch Video');
  const [editPageId, setEditPageId] = useState('');
  const [editPageName, setEditPageName] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [showEditCalendar, setShowEditCalendar] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Facebook Connection Modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [fbAccessTokenInput, setFbAccessTokenInput] = useState('');
  const [isConnectingFb, setIsConnectingFb] = useState(false);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Auto-refresh timer
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // refresh every 8s to track progress
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [postsRes, fbRes] = await Promise.all([
        fetch(`${API_BASE_URL}/posts`),
        fetch(`${API_BASE_URL}/api/fb/status`)
      ]);
      
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        // Sort posts by created_at desc
        postsData.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setPosts(postsData);
      }
      
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        setFbStatus(fbData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectFb = async (token = null) => {
    const tokenToUse = token || fbAccessTokenInput;
    if (!tokenToUse) {
      alert("Please enter a valid Access Token");
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
        setShowConnectModal(false);
        setFbAccessTokenInput('');
        fetchData();
        alert("Facebook account connected successfully!");
      } else {
        alert(data.detail || "Failed to connect Facebook account");
      }
    } catch (error) {
      alert("Error connecting to server: " + error.message);
    } finally {
      setIsConnectingFb(false);
    }
  };

  const handleUseMockFb = () => {
    // Generate a mock token for sandboxing
    const mockToken = "EAAGzD123_MOCK_TOKEN_EAAgzd123";
    handleConnectFb(mockToken);
  };

  const handleDisconnectFb = async () => {
    if (!confirm("Are you sure you want to disconnect Facebook account?")) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/fb/disconnect`, {
        method: 'POST'
      });
      if (response.ok) {
        setFbStatus({ connected: false, user_name: '', user_id: '', pages: [] });
        fetchData();
        alert("Facebook account disconnected.");
      }
    } catch (error) {
      alert("Error disconnecting: " + error.message);
    }
  };

  // Post Actions
  const handlePublishNow = async (postId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/publish`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchData();
        alert("Publishing process initiated. Refreshing status...");
      } else {
        const data = await response.json();
        alert(data.detail || "Failed to initiate publishing");
      }
    } catch (error) {
      alert("Network error: " + error.message);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setPosts(posts.filter(p => p.id !== postId));
        setSelectedPostIds(selectedPostIds.filter(id => id !== postId));
        if (editingPost?.id === postId) {
          setEditingPost(null);
        }
      }
    } catch (error) {
      alert("Failed to delete post: " + error.message);
    }
  };

  // Bulk Actions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const visiblePostIds = filteredPosts.map(p => p.id);
      setSelectedPostIds(visiblePostIds);
    } else {
      setSelectedPostIds([]);
    }
  };

  const handleSelectPost = (postId) => {
    if (selectedPostIds.includes(postId)) {
      setSelectedPostIds(selectedPostIds.filter(id => id !== postId));
    } else {
      setSelectedPostIds([...selectedPostIds, postId]);
    }
  };

  const handleBulkPublish = async () => {
    if (selectedPostIds.length === 0) return;
    if (!confirm(`Are you sure you want to publish ${selectedPostIds.length} posts now?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/bulk-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ids: selectedPostIds })
      });
      if (response.ok) {
        setSelectedPostIds([]);
        fetchData();
        alert("Bulk publishing started successfully!");
      }
    } catch (error) {
      alert("Bulk publishing failed: " + error.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPostIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedPostIds.length} selected posts?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ids: selectedPostIds })
      });
      if (response.ok) {
        setSelectedPostIds([]);
        fetchData();
        alert("Selected posts deleted successfully!");
      }
    } catch (error) {
      alert("Bulk delete failed: " + error.message);
    }
  };

  // Edit Drawer
  const handleStartEdit = (post) => {
    setEditingPost(post);
    setEditCaption(post.caption || '');
    setEditCtaText('Watch Video');
    setEditPageId(post.fb_page_id || '');
    setEditPageName(post.fb_page_name || '');
    
    if (post.scheduled_time) {
      const [date, time] = post.scheduled_time.split('T');
      setEditScheduledDate(date || '');
      setEditScheduledTime(time || '');
    } else {
      setEditScheduledDate('');
      setEditScheduledTime('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;

    setIsSavingEdit(true);
    
    let scheduled_time = "";
    if (editScheduledDate && editScheduledTime) {
      scheduled_time = `${editScheduledDate}T${editScheduledTime}`;
    }

    // Resolve page name
    let pageName = editPageName;
    const pageObj = (fbStatus.pages || []).find(p => String(p.id) === String(editPageId));
    if (pageObj) {
      pageName = pageObj.name;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${editingPost.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: editingPost.video_url,
          video_path: editingPost.video_path,
          caption: editCaption,
          fb_page_id: editPageId,
          fb_page_name: pageName,
          scheduled_time: scheduled_time,
          thumbnail_url: editingPost.thumbnail_url
        })
      });

      if (response.ok) {
        const updated = await response.json();
        setPosts(posts.map(p => p.id === editingPost.id ? updated.post : p));
        setEditingPost(null);
        alert("Changes saved successfully!");
      } else {
        alert("Failed to save changes");
      }
    } catch (error) {
      alert("Failed to update post: " + error.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Helper formats
  const formatDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  };

  const formatSchedule = (schedStr) => {
    if (!schedStr) return 'Publish Immediately';
    try {
      const [date, time] = schedStr.split('T');
      const dateObj = new Date(`${date}T${time}`);
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return schedStr;
    }
  };

  // Filters
  const filteredPosts = posts.filter(post => {
    const matchesSearch = (post.caption || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (post.fb_page_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return post.status === statusFilter && matchesSearch;
  });

  // Calculate statistics
  const totalPosts = posts.length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const processingCount = posts.filter(p => p.status === 'processing').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const failedCount = posts.filter(p => p.status === 'failed').length;

  return (
    <div className="pe-manager-container">
      {/* Top statistics summary bar */}
      <section className="pe-stats-grid">
        <div className="pe-stat-card">
          <div className="pe-stat-label">Total Posts</div>
          <div className="pe-stat-number">{totalPosts}</div>
        </div>
        <div className="pe-stat-card pe-stat-card--scheduled">
          <div className="pe-stat-label">Scheduled</div>
          <div className="pe-stat-number">{scheduledCount}</div>
        </div>
        <div className="pe-stat-card pe-stat-card--processing">
          <div className="pe-stat-label">Publishing</div>
          <div className="pe-stat-number">{processingCount}</div>
        </div>
        <div className="pe-stat-card pe-stat-card--published">
          <div className="pe-stat-label">Published</div>
          <div className="pe-stat-number">{publishedCount}</div>
        </div>
        <div className="pe-stat-card pe-stat-card--failed">
          <div className="pe-stat-label">Failed</div>
          <div className="pe-stat-number">{failedCount}</div>
        </div>
      </section>

      {/* Facebook Account connection management header */}
      <section className="fb-account-bar">
        <div className="fb-account-info">
          <div className="fb-avatar-glow">
            <span className="fb-brand-icon">f</span>
          </div>
          {fbStatus.connected ? (
            <div>
              <h3>Connected to Facebook</h3>
              <p>User: <strong>{fbStatus.user_name}</strong> (Pages: {(fbStatus.pages || []).length})</p>
            </div>
          ) : (
            <div>
              <h3>Facebook Disconnected</h3>
              <p>Connect your account to enable direct publishing to Facebook Pages & Power Editor.</p>
            </div>
          )}
        </div>
        <div className="fb-account-actions">
          {fbStatus.connected ? (
            <button type="button" className="fb-disconnect-btn" onClick={handleDisconnectFb}>
              Disconnect Account
            </button>
          ) : (
            <button type="button" className="fb-connect-btn" onClick={() => setShowConnectModal(true)}>
              Connect Facebook Profile
            </button>
          )}
        </div>
      </section>

      {/* Main Campaign/Posts Table Controls */}
      <div className="pe-main-board">
        <div className="pe-toolbar">
          <div className="pe-filters">
            <input
              type="text"
              placeholder="Search posts or pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pe-search-input"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pe-filter-dropdown"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="processing">Publishing</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {selectedPostIds.length > 0 && (
            <div className="pe-bulk-actions">
              <span className="pe-bulk-count">{selectedPostIds.length} selected</span>
              <button type="button" className="pe-bulk-btn pe-bulk-btn--publish" onClick={handleBulkPublish}>
                Bulk Publish
              </button>
              <button type="button" className="pe-bulk-btn pe-bulk-btn--delete" onClick={handleBulkDelete}>
                Bulk Delete
              </button>
            </div>
          )}
        </div>

        {/* Post Spreadsheet Grid */}
        <div className="pe-table-responsive">
          <table className="pe-spreadsheet-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={filteredPosts.length > 0 && selectedPostIds.length === filteredPosts.length}
                  />
                </th>
                <th>Status</th>
                <th>Caption & Media</th>
                <th>Post Target Page</th>
                <th>Timing Schedule</th>
                <th>FB Post ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="pe-table-empty">Loading posts dashboard...</td>
                </tr>
              ) : filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="pe-table-empty">
                    No posts found. Go to <strong>PE Post Builder</strong> to create one!
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post) => {
                  const isChecked = selectedPostIds.includes(post.id);
                  const isPostProcessing = post.status === 'processing';
                  
                  return (
                    <tr key={post.id} className={isChecked ? 'row--selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectPost(post.id)}
                        />
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${post.status}`}>
                          {post.status}
                          {post.status === 'processing' && <span className="spinner-micro" />}
                        </span>
                        {post.status === 'failed' && post.error_message && (
                          <div className="status-error-tooltip" title={post.error_message}>
                            ⚠️ Error Detail
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="media-cell">
                          <div className="media-cell-thumbnail">
                            {post.thumbnail_url || post.video_url ? (
                              <img src={post.thumbnail_url || "https://img.icons8.com/color/96/video.png"} alt="Video Preview" />
                            ) : (
                              <div className="media-placeholder">MP4</div>
                            )}
                          </div>
                          <div className="media-cell-info">
                            <strong className="media-caption-snippet">
                              {post.caption ? (post.caption.slice(0, 75) + (post.caption.length > 75 ? '...' : '')) : 'No Caption'}
                            </strong>
                            <span className="media-type-tag">
                              {post.video_url ? 'TikTok/Link' : 'Local File'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="fb-page-badge">
                          🏁 {post.fb_page_name || 'casual page'}
                        </span>
                      </td>
                      <td>
                        <div className="timing-cell">
                          <strong>{formatSchedule(post.scheduled_time)}</strong>
                          {post.published_at && (
                            <span className="published-date">Published: {formatDate(post.published_at)}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {post.fb_post_id ? (
                          <a
                            href={`https://facebook.com/${post.fb_post_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="fb-post-link"
                          >
                            🔗 {post.fb_post_id.slice(0, 10)}...
                          </a>
                        ) : (
                          <span className="text-muted">Not Posted</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="pe-action-btn pe-action-btn--edit"
                            onClick={() => handleStartEdit(post)}
                            disabled={isPostProcessing}
                          >
                            Edit
                          </button>
                          
                          {post.status !== 'published' && (
                            <button
                              type="button"
                              className="pe-action-btn pe-action-btn--publish"
                              onClick={() => handlePublishNow(post.id)}
                              disabled={isPostProcessing}
                            >
                              Publish Now
                            </button>
                          )}
                          
                          <button
                            type="button"
                            className="pe-action-btn pe-action-btn--delete"
                            onClick={() => handleDeletePost(post.id)}
                            disabled={isPostProcessing}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sliding Edit Drawer - Matches FB Power Editor Panel */}
      {editingPost && (
        <div className="pe-drawer-backdrop" onClick={() => setEditingPost(null)}>
          <div className="pe-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pe-drawer-header">
              <h2>Edit Post Draft (ID: {editingPost.id})</h2>
              <button type="button" className="close-drawer-btn" onClick={() => setEditingPost(null)}>✕</button>
            </div>
            
            <div className="pe-drawer-body">
              <div className="pe-drawer-split">
                {/* Form Controls */}
                <div className="pe-drawer-form">
                  <div className="input-group">
                    <label>Selected Page:</label>
                    {fbStatus.connected ? (
                      <select
                        value={editPageId}
                        onChange={(e) => setEditPageId(e.target.value)}
                        className="pe-select-page"
                      >
                        <option value="">Choose Facebook Page</option>
                        {(fbStatus.pages || []).map(page => (
                          <option key={page.id} value={page.id}>{page.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="page-disconnected-alert">
                        Facebook Disconnected. Using: <strong>{editingPost.fb_page_name}</strong>
                      </div>
                    )}
                  </div>

                  <div className="input-group">
                    <label>Caption Text:</label>
                    <textarea
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      rows="6"
                      className="caption-input"
                    />
                  </div>

                  <div className="input-group">
                    <label>Reschedule Timing:</label>
                    <div className="drawer-schedule-grid">
                      <input
                        type="date"
                        value={editScheduledDate}
                        onChange={(e) => setEditScheduledDate(e.target.value)}
                        className="schedule-date-input"
                      />
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={(e) => setEditScheduledTime(e.target.value)}
                        className="schedule-time-input"
                      />
                    </div>
                    <div className="schedule-actions-drawer">
                      <button
                        type="button"
                        className="clear-schedule-btn-drawer"
                        onClick={() => { setEditScheduledDate(''); setEditScheduledTime(''); }}
                      >
                        Clear (Publish Instantly)
                      </button>
                      <button
                        type="button"
                        className="calendar-trigger-btn-drawer"
                        onClick={() => setShowEditCalendar(true)}
                      >
                        Open Calendar
                      </button>
                    </div>
                  </div>
                  
                  {editingPost.video_path && (
                    <div className="drawer-video-meta">
                      <strong>Local file:</strong> {editingPost.video_path.split(/[\\/]/).pop()}
                    </div>
                  )}
                </div>

                {/* Live Facebook Preview */}
                <div className="pe-drawer-preview">
                  <h3>Facebook Feed Live Preview</h3>
                  <FacebookPreview
                    pageName={editPageName || (fbStatus.pages || []).find(p => String(p.id) === String(editPageId))?.name || editingPost.fb_page_name || 'casual page'}
                    caption={editCaption}
                    videoSrc={editingPost.video_url || (editingPost.video_path ? `${API_BASE_URL}/uploads/${editingPost.video_path.split(/[\\/]/).pop()}` : null)}
                    ctaText={editCtaText}
                    selectedThumbnail={editingPost.thumbnail_url}
                    onCaptionChange={setEditCaption}
                    onCtaTextChange={setEditCtaText}
                  />
                </div>
              </div>
            </div>

            <div className="pe-drawer-footer">
              <button type="button" className="drawer-btn drawer-btn--cancel" onClick={() => setEditingPost(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="drawer-btn drawer-btn--save"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DateTime Picker Modal */}
      {showEditCalendar && (
        <div className="calendar-modal">
          <DateTimePicker
            value={editScheduledDate && editScheduledTime ? `${editScheduledDate}T${editScheduledTime}` : ''}
            onChange={(dateTime) => {
              const selected = typeof dateTime === 'string' ? dateTime : dateTime?.toISOString?.() || '';
              if (!selected) return;
              const [date, time] = selected.split('T');
              const [hour, minute] = time.split(':');
              setEditScheduledDate(date);
              setEditScheduledTime(`${hour}:${minute}`);
              setShowEditCalendar(false);
            }}
            onCancel={() => setShowEditCalendar(false)}
          />
        </div>
      )}

      {/* Facebook Access Token Connection Modal */}
      {showConnectModal && (
        <div className="pe-modal-overlay">
          <div className="pe-modal-box">
            <div className="pe-modal-header">
              <h2>Connect Facebook Account</h2>
              <button type="button" className="close-modal-btn" onClick={() => setShowConnectModal(false)}>✕</button>
            </div>
            <div className="pe-modal-body">
              <p className="pe-modal-desc">
                Paste a <strong>Facebook Graph User Access Token</strong> to link your profile. 
                The token must have permissions like <code>pages_show_list</code>, <code>pages_read_engagement</code>, and <code>pages_manage_posts</code>.
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
            </div>
            <div className="pe-modal-footer">
              <button
                type="button"
                className="modal-btn modal-btn--sandbox"
                onClick={handleUseMockFb}
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
                <button
                  type="button"
                  className="modal-btn modal-btn--connect"
                  onClick={() => handleConnectFb()}
                  disabled={isConnectingFb || !fbAccessTokenInput.trim()}
                >
                  {isConnectingFb ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
