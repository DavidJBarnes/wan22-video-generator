import { useState, useEffect, useRef } from 'react';

/**
 * LazyImage - An image component that only loads when visible in the viewport.
 * Uses Intersection Observer for efficient lazy loading.
 *
 * Props:
 * - src: The image source URL
 * - alt: Alt text for the image
 * - thumbnailSrc: Optional smaller thumbnail to load first (for progressive loading)
 * - className: CSS class name
 * - style: Inline styles
 * - onError: Error handler callback
 * - onClick: Click handler
 * - rootMargin: How far from viewport to start loading (default: "100px")
 */
export default function LazyImage({
  src,
  alt = '',
  thumbnailSrc,
  className = '',
  style = {},
  onError,
  onClick,
  rootMargin = '100px'
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Once in view, stop observing
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin,
        threshold: 0
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = (e) => {
    setHasError(true);
    if (onError) {
      onError(e);
    }
  };

  // Placeholder while not in view
  const placeholderStyle = {
    backgroundColor: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  };

  if (!isInView) {
    return (
      <div
        ref={imgRef}
        className={className}
        style={placeholderStyle}
        onClick={onClick}
      >
        {/* Empty placeholder - just takes up space until in view */}
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.2s ease-in-out'
      }}
      onLoad={handleLoad}
      onError={handleError}
      onClick={onClick}
      loading="lazy"
    />
  );
}
