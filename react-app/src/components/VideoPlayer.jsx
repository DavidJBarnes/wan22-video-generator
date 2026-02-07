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
  // Start with local if available, otherwise remote
  const [currentSrc, setCurrentSrc] = useState(() => localSrc || src);
  const [triedLocal, setTriedLocal] = useState(false);
  const videoRef = useRef(null);

  // Reset when src/localSrc props change
  useEffect(() => {
    setTriedLocal(false);
    setCurrentSrc(localSrc || src);
  }, [src, localSrc]);

  const handleError = () => {
    // If we were trying local, fall back to remote
    if (localSrc && !triedLocal && currentSrc === localSrc) {
      setTriedLocal(true);
      setCurrentSrc(src);
    } else if (onError) {
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
  const remoteSrc = API.getJobVideo(jobId);
  const localSrc = API.getLocalJobVideo(jobId, filename);
  const localPoster = API.getLocalJobThumbnail(jobId);

  const [currentSrc, setCurrentSrc] = useState(() => localSrc || remoteSrc);
  const [triedLocal, setTriedLocal] = useState(false);
  const [currentPoster, setCurrentPoster] = useState(() => localPoster || poster);
  const [triedLocalPoster, setTriedLocalPoster] = useState(false);
  const videoRef = useRef(null);

  // Reset when jobId changes
  useEffect(() => {
    setTriedLocal(false);
    setTriedLocalPoster(false);
    setCurrentSrc(localSrc || remoteSrc);
    setCurrentPoster(localPoster || poster);
  }, [jobId, localSrc, remoteSrc, localPoster, poster]);

  // Test local poster availability
  useEffect(() => {
    if (localPoster && !triedLocalPoster) {
      const img = new Image();
      img.onload = () => setCurrentPoster(localPoster);
      img.onerror = () => {
        setTriedLocalPoster(true);
        setCurrentPoster(poster);
      };
      img.src = localPoster;
    }
  }, [localPoster, poster, triedLocalPoster]);

  const handleError = () => {
    if (localSrc && !triedLocal && currentSrc === localSrc) {
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
      poster={currentPoster}
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

/**
 * Job thumbnail component with local/remote fallback.
 * Tries local server first, falls back to API on error.
 *
 * @param {Object} props
 * @param {number} props.jobId - Job ID
 * @param {string} props.className - CSS class
 * @param {Object} props.style - Inline styles
 * @param {string} props.alt - Alt text
 * @param {function} props.onError - Error callback (after fallback exhausted)
 */
export function JobThumbnail({ jobId, className, style, alt = '', onError, ...rest }) {
  const remoteSrc = API.getJobThumbnail(jobId);
  const localSrc = API.getLocalJobThumbnail(jobId);

  const [currentSrc, setCurrentSrc] = useState(() => localSrc || remoteSrc);
  const [triedLocal, setTriedLocal] = useState(false);

  // Reset when jobId changes
  useEffect(() => {
    setTriedLocal(false);
    setCurrentSrc(localSrc || remoteSrc);
  }, [jobId, localSrc, remoteSrc]);

  const handleError = (e) => {
    if (localSrc && !triedLocal && currentSrc === localSrc) {
      setTriedLocal(true);
      setCurrentSrc(remoteSrc);
    } else {
      // Hide image on final error
      e.target.style.display = 'none';
      if (onError) onError(e);
    }
  };

  if (!currentSrc) return null;

  return (
    <img
      src={currentSrc}
      className={className}
      style={style}
      alt={alt}
      onError={handleError}
      {...rest}
    />
  );
}
