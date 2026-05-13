import React from 'react';
import { AbsoluteFill, Audio, staticFile, Sequence } from 'remotion';
import { LaunchVideo } from './LaunchVideo.jsx';

/**
 * Wraps LaunchVideo with an audio track.
 * Place your music file at: public/music.mp3
 * Any royalty-free 8-second track works. We recommend:
 *   https://pixabay.com/music/search/upbeat%20corporate/
 */
export const LaunchVideoWithAudio = () => (
  <AbsoluteFill>
    <LaunchVideo />
    {/* Audio fades in at frame 0, fades out near the end */}
    <Sequence from={0} durationInFrames={240}>
      <Audio
        src={staticFile('music.mp3')}
        startFrom={0}
        endAt={240}
        volume={(f) =>
          f < 10
            ? f / 10           // fade-in over first 10 frames
            : f > 220
            ? (240 - f) / 20   // fade-out over last 20 frames
            : 1
        }
      />
    </Sequence>
  </AbsoluteFill>
);
