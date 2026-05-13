import { registerRoot } from 'remotion';
import { Composition } from 'remotion';
import { LaunchVideo } from './LaunchVideo.jsx';
import { LaunchVideoWithAudio } from './LaunchVideoWithAudio.jsx';
import React from 'react';

const Root = () => (
  <>
    {/* Without audio — safe to render anytime */}
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={240}
      fps={30}
      width={1280}
      height={720}
    />
    {/* With audio — place public/music.mp3 first */}
    <Composition
      id="LaunchVideoWithAudio"
      component={LaunchVideoWithAudio}
      durationInFrames={240}
      fps={30}
      width={1280}
      height={720}
    />
  </>
);

registerRoot(Root);
