import { useState } from 'react';
import './SchedulePublish.css';

const toDateTimeLocal = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function SchedulePublish({ onApply, onCancel }) {
  const [selectedDateTime, setSelectedDateTime] = useState('');
  const [error, setError] = useState('');

  const minDateTime = toDateTimeLocal(new Date());
  const selectedDate = selectedDateTime ? new Date(selectedDateTime) : null;
  const isFuture = Boolean(selectedDate) && selectedDate > new Date();

  const handleApply = () => {
    if (!selectedDateTime || !isFuture) {
      setError('Please select a future date and time');
      return;
    }
    setError('');
    onApply?.({ dateTime: selectedDate.toISOString() });
  };

  return (
    <div className="schedule-panel">
      <div className="schedule-header">
        <h3>Schedule Post</h3>
        <p>Publish at the perfect time for your audience</p>
      </div>

      <input
        type="datetime-local"
        value={selectedDateTime}
        min={minDateTime}
        onChange={(event) => {
          setSelectedDateTime(event.target.value);
          setError('');
        }}
        className="schedule-input"
        aria-label="Select publish date and time"
        placeholder="Select date and time"
      />

      {error && <p className="schedule-error">{error}</p>}

      <div className={`schedule-status${isFuture ? ' active' : ''}`}>
        {isFuture ? 'Ready to schedule' : 'Select a time'}
      </div>

      <div className="schedule-buttons">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={handleApply}>Schedule</button>
      </div>
    </div>
  );
}
