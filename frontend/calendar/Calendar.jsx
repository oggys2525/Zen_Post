import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import './Calendar.css';

export default function Calendar({ onApply, onCancel }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  useEffect(() => {
    const now = new Date();
    setSelectedHour(String(now.getHours()).padStart(2, '0'));
    setSelectedMinute(String(now.getMinutes()).padStart(2, '0'));
  }, []);

  const handleDateClick = (arg) => {
    setSelectedDate(arg.dateStr);
  };

  const generateHours = () => {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push(String(i).padStart(2, '0'));
    }
    return hours;
  };

  const generateMinutes = () => {
    const minutes = [];
    for (let i = 0; i < 60; i++) {
      minutes.push(String(i).padStart(2, '0'));
    }
    return minutes;
  };

  const handleApply = () => {
    if (!selectedDate) {
      alert('Please select a date');
      return;
    }
    onApply(`${selectedDate}T${selectedHour}:${selectedMinute}`);
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="calendar-picker">
      <div className="calendar-header">
        <h3>Select Date & Time</h3>
      </div>
      <div className="calendar-grid">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          selectable={true}
          dateClick={handleDateClick}
          validRange={{ start: todayStr }}
          headerToolbar={{
            left: 'prev',
            center: 'title',
            right: 'next'
          }}
          height="auto"
          dayMaxEventRows={true}
        />
      </div>
      {selectedDate && (
        <div className="selected-date-display">
          Selected: {formatDate(selectedDate)} at {selectedHour}:{selectedMinute}
        </div>
      )}
      <div className="time-selector">
        <div className="time-label">Time:</div>
        <div className="time-dropdowns">
          <select
            value={selectedHour}
            onChange={(e) => setSelectedHour(e.target.value)}
            className="time-dropdown"
          >
            {generateHours().map((hour) => (
              <option key={hour} value={hour}>{hour}</option>
            ))}
          </select>
          <span className="time-separator">:</span>
          <select
            value={selectedMinute}
            onChange={(e) => setSelectedMinute(e.target.value)}
            className="time-dropdown"
          >
            {generateMinutes().map((minute) => (
              <option key={minute} value={minute}>{minute}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="calendar-actions">
        <button type="button" className="cancel-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="apply-btn" onClick={handleApply}>Apply</button>
      </div>
    </div>
  );
}