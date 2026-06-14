import React from 'react';
import './VideoPlayer.css';

export default function VideoPlayer({ src }) {
  return (
    <div className="video-player">
      <video
        className="video-player__video"
        key={src}
        src={src}
        preload="auto"
        controls
        playsInline
      />
    </div>
  );
}