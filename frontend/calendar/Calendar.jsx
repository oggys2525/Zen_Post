import React, { useState, useEffect, useRef } from 'react';
import './Calendar.css';

const pad = (value) => String(value).padStart(2, '0');

const formatDateTime = (date, hour24, minute) => {
  if (!date) return '';
  const hours = parseInt(hour24, 10) || 0;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const minuteNum = parseInt(minute, 10) || 0;
  return `${date}, ${pad(hour12)}:${pad(minuteNum)} ${ampm}`;
};

export default function DateTimePicker({ value, onChange, onCancel }) {
  const [date, setDate] = useState('');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmPm] = useState('AM');
  const pickerRef = useRef(null);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  useEffect(() => {
    if (!value) return;
    const d = new Date(value);
    setDate(d.toISOString().split('T')[0]);
    let h = d.getHours();
    const m = d.getMinutes();
    setHour(pad(h));
    setMinute(pad(m));
    setAmPm(h < 12 ? 'AM' : 'PM');
  }, [value]);

  const to24 = (h, period) => {
    let current = parseInt(h, 10) || 0;
    if (period === 'AM' && current === 12) current = 0;
    if (period === 'PM' && current !== 12) current += 12;
    return pad(current);
  };

  const handleApply = () => {
    if (!date) return;
    const hour24 = to24(hour, ampm);
    onChange(`${date}T${hour24}:${minute}`);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleHourChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setHour(value);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        handleCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  return (
    <div className="dtp-picker" ref={pickerRef}>
      <div className="dtp-picker-row">
        <label className="dtp-label">Date:</label>
        <input
          type="date"
          className="dtp-date-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={todayStr}
        />
      </div>

      <div className="dtp-picker-row">
        <label className="dtp-label">Time:</label>
        <div className="dtp-time-row">
          <input
            type="text"
            inputMode="numeric"
            className="dtp-time-input"
            value={hour}
            onChange={handleHourChange}
            maxLength={2}
            placeholder="HH"
          />
          <span className="dtp-separator">:</span>
          <input
            type="text"
            inputMode="numeric"
            className="dtp-time-input"
            value={minute}
            onChange={(e) => setMinute(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            maxLength={2}
            placeholder="MM"
          />
          <select
            className="dtp-ampm-select"
            value={ampm}
            onChange={(e) => setAmPm(e.target.value)}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>

      <div className="dtp-actions">
        <button type="button" className="dtp-btn dtp-btn-cancel" onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className="dtp-btn dtp-btn-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}
