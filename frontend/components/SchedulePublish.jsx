import React, { useState } from 'react';
import { Card, CardContent, CardActions, Button, Switch, FormControlLabel, TextField } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import './SchedulePublish.css';

export default function SchedulePublish({ onApply, onCancel }) {
  const [selectedDateTime, setSelectedDateTime] = useState(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleApply = () => {
    if (!selectedDateTime) {
      setError('Please select a date and time');
      return;
    }

    const selected = new Date(selectedDateTime);
    const now = new Date();
    if (selected <= now) {
      setError('Scheduled time must be in the future');
      return;
    }

    setError('');
    onApply({
      dateTime: selectedDateTime.toISOString(),
      makeDefault
    });
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Card className="schedule-publish-card">
        <CardContent className="schedule-publish-content">
          <h3 className="schedule-publish-title">Schedule Publish</h3>
          <DateTimePicker
            label="Select Date & Time"
            value={selectedDateTime}
            onChange={(newValue) => {
              setSelectedDateTime(newValue);
              setError('');
            }}
            minDateTime={today}
            renderInput={(params) => (
              <TextField
                {...params}
                fullWidth
                error={!!error}
                helperText={error}
                className="datetime-picker"
              />
            )}
          />
          <FormControlLabel
            control={
              <Switch
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
                color="primary"
              />
            }
            label="Make current template default when published?"
            className="default-switch"
          />
        </CardContent>
        <CardActions className="schedule-publish-actions">
          <Button onClick={onCancel} className="cancel-btn">Cancel</Button>
          <Button onClick={handleApply} variant="contained" className="apply-btn">Apply</Button>
        </CardActions>
      </Card>
    </LocalizationProvider>
  );
}