import { useState, useRef, useEffect } from 'react';
import API from '../api/client';

/**
 * Video player component with local/remote fallback.
 *
 * Tries to load video from local server first (if configured),
 * falls back to remote API on error.
 *
 * @param {Object} props
 * @param {string} props.src - Remote video URL
 * @param {string} props.localSrc - Local video URL (optional, will use API.getLocalServerUrl if available)
 * @param {string} props.className - CSS class for the video element
 * @param {Object} props.style - Inline styles
 * @param {boolean} props.controls - Show video controls (default: true)
 * @param {boolean} props.autoPlay - Auto-play video (default: false)
 * @param {boolean} props.loop - Loop video (default: false)
 * @param {boolean} props.muted - Mute video (default: false)
 * @param {string} props.poster - Poster image URL
 * @param {function} props.onLoadedData - Callback when video data is loaded
 * @param {function} props.onError - Callback on error (after all fallbacks exhausted)
 */
export default function VideoPlayer({
  src,
  localSrc,
  className,
  style,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
  poster,
  onLoadedData,
  onError,
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(null);
  const [isLocal, setIsLocal] = useState(false);
  const [triedLocal, setTriedLocal] = useState(false);
  const videoRef = useRef(null);

  // Determine initial source
  useEffect(() => {
    const localUrl = localSrc || null;

    if (localUrl && !triedLocal) {
      // Try local first
      setCurrentSrc(localUrl);
      setIsLocal(true);
    } else {
      // Use remote
      setCurrentSrc(src);
      setIsLocal(false);
    }
  }, [src, localSrc, triedLocal]);

  const handleError = () => {
    if (isLocal && !triedLocal) {
      // Local failed, fall back to remote
      setTriedLocal(true);
      setCurrentSrc(src);
      setIsLocal(false);
    } else if (onError) {
      // Remote also failed
      onError();
    }
  };

  const handleLoadedData = (e) => {
    if (onLoadedData) {
      onLoadedData(e);
    }
  };

  if (!currentSrc) return null;

  return (
    <video
      ref={videoRef}
      src={currentSrc}
      className={className}
      style={style}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      poster={poster}
      onError={handleError}
      onLoadedData={handleLoadedData}
      {...rest}
    />
  );
}

/**
 * Video preview component with hover-to-play and local/remote fallback.
 * Used in video cards/grids where videos play on hover.
 *
 * @param {Object} props
 * @param {number} props.jobId - Job ID
 * @param {string} props.filename - Video filename (optional, for local lookup)
 * @param {string} props.poster - Poster/thumbnail URL
 * @param {string} props.className - CSS class
 * @param {Object} props.style - Inline styles
 */
export function VideoPreview({ jobId, filename, poster, className, style, ...rest }) {
  const [currentSrc, setCurrentSrc] = useState(null);
  const [triedLocal, setTriedLocal] = useState(false);
  const videoRef = useRef(null);

  const remoteSrc = API.getJobVideo(jobId);
  const localSrc = API.getLocalJobVideo(jobId, filename);

  useEffect(() => {
    if (localSrc && !triedLocal) {
      setCurrentSrc(localSrc);
    } else {
      setCurrentSrc(remoteSrc);
    }
  }, [localSrc, remoteSrc, triedLocal, jobId]);

  const handleError = () => {
    if (localSrc && !triedLocal) {
      setTriedLocal(true);
      setCurrentSrc(remoteSrc);
    }
  };

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  if (!currentSrc) return null;

  return (
    <video
      ref={videoRef}
      src={currentSrc}
      poster={poster}
      className={className}
      style={style}
      muted
      loop
      playsInline
      onError={handleError}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    />
  );
}

/**
 * Segment video player with automatic local/remote handling.
 *
 * @param {Object} props
 * @param {number} props.jobId - Job ID
 * @param {number} props.segmentIndex - Segment index
 * @param {string} props.className - CSS class
 * @param {Object} props.style - Inline styles
 * @param {boolean} props.controls - Show controls (default: true)
 */
export function SegmentVideoPlayer({ jobId, segmentIndex, ...rest }) {
  const remoteSrc = API.getSegmentVideo(jobId, segmentIndex);
  const localSrc = API.getLocalSegmentVideo(jobId, segmentIndex);

  return (
    <VideoPlayer
      src={remoteSrc}
      localSrc={localSrc}
      {...rest}
    />
  );
}

/**
 * Job video player (final merged video) with automatic local/remote handling.
 *
 * @param {Object} props
 * @param {number} props.jobId - Job ID
 * @param {string} props.filename - Video filename (optional, for local lookup)
 * @param {string} props.className - CSS class
 * @param {Object} props.style - Inline styles
 * @param {boolean} props.controls - Show controls (default: true)
 */
export function JobVideoPlayer({ jobId, filename, ...rest }) {
  const remoteSrc = API.getJobVideo(jobId);
  const localSrc = API.getLocalJobVideo(jobId, filename);

  return (
    <VideoPlayer
      src={remoteSrc}
      localSrc={localSrc}
      {...rest}
    />
  );
}
