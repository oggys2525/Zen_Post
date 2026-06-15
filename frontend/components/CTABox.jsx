import { useState } from 'react';
import './CTABox.css';

export default function CTABox({ value, onChange, onAdd, recentActions = [], onSelectRecent }) {
  const [internalValue, setInternalValue] = useState('');
  const selectedAction = value ?? internalValue;

  const handleInputChange = (event) => {
    const nextValue = event.target.value;

    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  };

  const handleSelectChange = (event) => {
    const nextValue = event.target.value;
    setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  const handleAddNew = () => {
    onAdd?.(selectedAction);
  };

  const handleRecentSelect = (event) => {
    const action = event.target.value;
    if (action) {
      setInternalValue(action);
      onChange?.(action);
    }
  };

  return (
    <div className="cta-box">
      <div className="cta-box-header">
        <h3>CTA Text</h3>
        <span className="cta-box-divider" />
      </div>

      <div className="cta-box-body">
        <input
          type="text"
          value={selectedAction}
          onChange={handleInputChange}
          className="cta-box-input"
          placeholder="Enter CTA text..."
          aria-label="CTA text input"
        />
        <button
          type="button"
          className="cta-box-add-btn"
          onClick={handleAddNew}
        >
          Add New
        </button>

        {recentActions.length > 0 && (
          <div className="cta-box-select-wrap">
            <select
              value=""
              onChange={handleRecentSelect}
              className="cta-box-select cta-box-recent-select"
              aria-label="Recent CTA actions"
            >
              <option value="">Recent CTAs...</option>
              {recentActions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
            <span className="cta-box-select-arrow" aria-hidden="true" />
          </div>
        )}

        <div className="cta-box-select-wrap">
          <select
            value={selectedAction}
            onChange={handleSelectChange}
            className="cta-box-select"
            aria-label="Choose the action"
          >
            <option value="">Choose the action..</option>
            <option value="Learn More">Learn More</option>
            <option value="Sign Up">Sign Up</option>
            <option value="Contact Us">Contact Us</option>
            <option value="Watch Video">Watch Video</option>
          </select>
          <span className="cta-box-select-arrow" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
