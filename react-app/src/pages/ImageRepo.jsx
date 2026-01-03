import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FormControl, InputLabel, Select, MenuItem, Pagination, Box, CircularProgress, Button } from '@mui/material';

const FOLDERS_PER_PAGE = 24;

// Fisher-Yates shuffle
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
import API from '../api/client';
import { showToast } from '../utils/helpers';
import CreateJobModal from '../components/CreateJobModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import './ImageRepo.css';

export default function ImageRepo() {
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);
  const [allImages, setAllImages] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [siblingFolders, setSiblingFolders] = useState([]);
  const [currentFolderIndex, setCurrentFolderIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [showJobModal, setShowJobModal] = useState(false);
  const [preUploadedImage, setPreUploadedImage] = useState(null);
  const [preUploadedDimensions, setPreUploadedDimensions] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [folderPage, setFolderPage] = useState(1);

  useEffect(() => {
    loadDirectory(currentPath);
    setFolderPage(1); // Reset page when navigating
  }, [currentPath]);

  useEffect(() => {
    applyRatingFilter();
  }, [ratingFilter, allImages]);

  async function loadDirectory(path) {
    setLoading(true);
    setError(null);

    try {
      const data = await API.browseImageRepo(path);

      // Sort items
      const sortedFolders = sortItems(data.folders || []);
      const sortedImages = sortItems(data.images || []);

      setFolders(sortedFolders);
      setAllImages(sortedImages);
      setBreadcrumbs(data.breadcrumbs || []);

      // Load sibling folders for navigation
      if (data.breadcrumbs && data.breadcrumbs.length > 1) {
        // Get parent path (second to last breadcrumb)
        const parentPath = data.breadcrumbs[data.breadcrumbs.length - 2].path;
        loadSiblingFolders(parentPath, path);
      } else {
        setSiblingFolders([]);
        setCurrentFolderIndex(-1);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to load image repository:', err);
      setError(err.message || 'Failed to load directory. Please check that the Image Repository Path is set correctly in Settings.');
      setLoading(false);
    }
  }

  async function loadSiblingFolders(parentPath, currentPath) {
    try {
      const data = await API.browseImageRepo(parentPath);
      const sortedSiblings = sortItems(data.folders || []);
      setSiblingFolders(sortedSiblings);

      // Find current folder index
      const index = sortedSiblings.findIndex(f => f.path === currentPath);
      setCurrentFolderIndex(index);
    } catch (err) {
      console.error('Failed to load sibling folders:', err);
      setSiblingFolders([]);
      setCurrentFolderIndex(-1);
    }
  }

  function applyRatingFilter() {
    if (ratingFilter === 'all') {
      setImages(allImages);
    } else if (ratingFilter === 'unrated') {
      setImages(allImages.filter(img => !img.rating));
    } else {
      const targetRating = parseInt(ratingFilter);
      setImages(allImages.filter(img => img.rating === targetRating));
    }
  }

  // Pagination for folders on main page (root level)
  const isRootLevel = currentPath === '';
  const folderPageCount = Math.ceil(folders.length / FOLDERS_PER_PAGE);
  const paginatedFolders = useMemo(() => {
    if (!isRootLevel) return folders; // No pagination in subfolders
    return folders.slice((folderPage - 1) * FOLDERS_PER_PAGE, folderPage * FOLDERS_PER_PAGE);
  }, [folders, folderPage, isRootLevel]);

  function handleFolderPageChange(event, value) {
    setFolderPage(value);
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const nameA = a.name;
      const nameB = b.name;

      // Check if names are date-formatted (YYYY-MM-DD)
      const datePatternA = nameA.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const datePatternB = nameB.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      // If both are date-formatted folders, always sort newest first
      if (datePatternA && datePatternB) {
        return nameB.localeCompare(nameA);  // Newest first
      }

      // For non-date items, use regular alphabetical sorting
      const lowerA = nameA.toLowerCase();
      const lowerB = nameB.toLowerCase();

      if (sortOrder === 'name-asc') {
        return lowerA.localeCompare(lowerB);
      } else if (sortOrder === 'name-desc') {
        return lowerB.localeCompare(lowerA);
      }
      return 0;
    });
  }

  function handleSortChange(newSort) {
    setSortOrder(newSort);
    setFolders(sortItems(folders));
    setImages(sortItems(images));
  }

  function navigateToPath(path) {
    setCurrentPath(path);
  }

  function navigateToPrevious() {
    if (currentFolderIndex > 0 && siblingFolders.length > 0) {
      const prevFolder = siblingFolders[currentFolderIndex - 1];
      setCurrentPath(prevFolder.path);
    }
  }

  function navigateToNext() {
    if (currentFolderIndex >= 0 && currentFolderIndex < siblingFolders.length - 1) {
      const nextFolder = siblingFolders[currentFolderIndex + 1];
      setCurrentPath(nextFolder.path);
    }
  }

  const [selectedImageIndex, setSelectedImageIndex] = useState(-1);
  const [savedScrollTop, setSavedScrollTop] = useState(0);

  // Slideshow state
  const [slideshowMode, setSlideshowMode] = useState(false);
  const [slideshowImages, setSlideshowImages] = useState([]);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [slideshowHistory, setSlideshowHistory] = useState([]);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [slideshowDelay, setSlideshowDelay] = useState(5);
  const [slideshowProgress, setSlideshowProgress] = useState(0);
  const [loadingSlideshow, setLoadingSlideshow] = useState(false);
  const [slideshowShowControls, setSlideshowShowControls] = useState(true);
  const slideshowTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  function reloadDirectory() {
    // Save scroll position before reload
    const mainContent = document.querySelector('.main-content');
    const scrollToRestore = mainContent ? mainContent.scrollTop : 0;

    loadDirectory(currentPath).then(() => {
      requestAnimationFrame(() => {
        const mc = document.querySelector('.main-content');
        if (mc) {
          mc.scrollTop = scrollToRestore;
        }
      });
    });
  }

  function openImagePreview(image, index) {
    // Save scroll position of .main-content (not window - window doesn't scroll in this layout)
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      setSavedScrollTop(mainContent.scrollTop);
    }
    setSelectedImage(image);
    setSelectedImageIndex(index);
    setShowPreviewModal(true);
  }

  function handleClosePreview() {
    const scrollToRestore = savedScrollTop;
    setShowPreviewModal(false);
    setSelectedImage(null);
    setSelectedImageIndex(-1);
    // Reload directory to reflect any rating changes, then restore scroll
    loadDirectory(currentPath).then(() => {
      requestAnimationFrame(() => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = scrollToRestore;
        }
      });
    });
  }

  function handleCreateJobFromPreview(imageUrl, dimensions) {
    // Close preview modal and open job modal
    setShowPreviewModal(false);
    setSelectedImage(null);
    setSelectedImageIndex(-1);
    setPreUploadedImage(imageUrl);
    setPreUploadedDimensions(dimensions || null);
    setShowJobModal(true);
  }

  function handleDeleteImage() {
    // Remove deleted image from local state and navigate to next
    const newImages = images.filter((_, i) => i !== selectedImageIndex);
    setAllImages(allImages.filter(img => img.path !== selectedImage.path));

    if (newImages.length === 0) {
      // No more images, close modal
      setImages(newImages);
      setShowPreviewModal(false);
      setSelectedImage(null);
      setSelectedImageIndex(-1);
    } else {
      // Navigate to next (or previous if we were at the end)
      const nextIndex = selectedImageIndex >= newImages.length ? newImages.length - 1 : selectedImageIndex;
      setImages(newImages);
      setSelectedImage(newImages[nextIndex]);
      setSelectedImageIndex(nextIndex);
    }
  }

  function handleNavigateImage(newIndex) {
    if (newIndex >= 0 && newIndex < images.length) {
      setSelectedImage(images[newIndex]);
      setSelectedImageIndex(newIndex);
    }
  }

  // Load slideshow delay setting
  useEffect(() => {
    async function loadSlideshowDelay() {
      try {
        const data = await API.getSettings();
        const settings = data.settings || data;
        setSlideshowDelay(parseInt(settings.slideshow_delay) || 5);
      } catch (err) {
        console.error('Failed to load slideshow delay:', err);
      }
    }
    loadSlideshowDelay();
  }, []);

  // Slideshow functions
  async function startSlideshow(recursive = false) {
    setLoadingSlideshow(true);
    try {
      let imagesToShuffle;
      if (recursive) {
        // Get all images recursively from current path (or root if at root)
        const data = await API.getAllImages(currentPath);
        imagesToShuffle = data.images || [];
      } else {
        // Use current directory images
        imagesToShuffle = [...images];
      }

      if (imagesToShuffle.length === 0) {
        showToast('No images found', 'warning');
        setLoadingSlideshow(false);
        return;
      }

      const shuffled = shuffleArray(imagesToShuffle);
      setSlideshowImages(shuffled);
      setSlideshowIndex(0);
      setSlideshowHistory([0]);
      setSlideshowPaused(false);
      setSlideshowProgress(0);
      setSlideshowMode(true);
    } catch (err) {
      console.error('Failed to start slideshow:', err);
      showToast('Failed to load images', 'error');
    }
    setLoadingSlideshow(false);
  }

  function exitSlideshow() {
    setSlideshowMode(false);
    setSlideshowImages([]);
    setSlideshowIndex(0);
    setSlideshowHistory([]);
    setSlideshowPaused(false);
    setSlideshowProgress(0);
    setSlideshowShowControls(true);
    if (slideshowTimerRef.current) {
      clearTimeout(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }

  // Handle mouse movement in slideshow - show controls temporarily
  const handleSlideshowMouseMove = useCallback(() => {
    setSlideshowShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setSlideshowShowControls(false);
    }, 2000); // Hide after 2 seconds of no movement
  }, []);

  // Delete current slideshow image
  const deleteSlideshowImage = useCallback(async () => {
    if (!slideshowImages[slideshowIndex]) return;

    const imageToDelete = slideshowImages[slideshowIndex];

    try {
      await API.deleteRepoImage(imageToDelete.path);
      showToast('Image deleted', 'success');

      // Remove from slideshow
      const newImages = slideshowImages.filter((_, i) => i !== slideshowIndex);

      if (newImages.length === 0) {
        exitSlideshow();
        return;
      }

      // Adjust index if we were at the end
      const newIndex = slideshowIndex >= newImages.length ? newImages.length - 1 : slideshowIndex;
      setSlideshowImages(newImages);
      setSlideshowIndex(newIndex);
      setSlideshowProgress(0);

      // Update history to remove references to deleted image
      setSlideshowHistory([newIndex]);
    } catch (err) {
      console.error('Failed to delete image:', err);
      showToast('Failed to delete image', 'error');
    }
  }, [slideshowImages, slideshowIndex]);

  const nextSlideshowImage = useCallback(() => {
    if (slideshowImages.length === 0) return;
    const nextIndex = (slideshowIndex + 1) % slideshowImages.length;
    setSlideshowIndex(nextIndex);
    setSlideshowHistory(prev => [...prev, nextIndex]);
    setSlideshowProgress(0);
  }, [slideshowIndex, slideshowImages.length]);

  const prevSlideshowImage = useCallback(() => {
    if (slideshowHistory.length <= 1) return;
    const newHistory = [...slideshowHistory];
    newHistory.pop();
    const prevIndex = newHistory[newHistory.length - 1];
    setSlideshowHistory(newHistory);
    setSlideshowIndex(prevIndex);
    setSlideshowProgress(0);
  }, [slideshowHistory]);

  const toggleSlideshowPause = useCallback(() => {
    setSlideshowPaused(prev => !prev);
  }, []);

  // Auto-advance timer for slideshow
  useEffect(() => {
    if (!slideshowMode || slideshowPaused || slideshowImages.length === 0) {
      if (slideshowTimerRef.current) {
        clearTimeout(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    // Progress bar update
    const progressStep = 100 / (slideshowDelay * 10); // Update every 100ms
    progressIntervalRef.current = setInterval(() => {
      setSlideshowProgress(prev => Math.min(prev + progressStep, 100));
    }, 100);

    // Auto-advance timer
    slideshowTimerRef.current = setTimeout(() => {
      nextSlideshowImage();
    }, slideshowDelay * 1000);

    return () => {
      if (slideshowTimerRef.current) {
        clearTimeout(slideshowTimerRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [slideshowMode, slideshowPaused, slideshowIndex, slideshowDelay, slideshowImages.length, nextSlideshowImage]);

  // Keyboard handler for slideshow
  useEffect(() => {
    if (!slideshowMode) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        exitSlideshow();
      } else if (e.key === 'ArrowRight') {
        nextSlideshowImage();
      } else if (e.key === 'ArrowLeft') {
        prevSlideshowImage();
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleSlideshowPause();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        deleteSlideshowImage();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideshowMode, nextSlideshowImage, prevSlideshowImage, toggleSlideshowPause, deleteSlideshowImage]);

  const currentSlideshowImage = slideshowImages[slideshowIndex];

  return (
    <div>
      {/* Sticky header section - negative margin pulls into parent padding, padding-top compensates */}
      <div style={{ position: 'sticky', top: '-32px', margin: '-32px -32px 16px -32px', padding: '32px 32px 16px 32px', backgroundColor: '#f5f5f5', zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: 0 }}>Image Repository</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Rating</InputLabel>
              <Select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                label="Rating"
              >
                <MenuItem value="all">All Images</MenuItem>
                <MenuItem value="unrated">Unrated</MenuItem>
                <MenuItem value="5">5 Stars</MenuItem>
                <MenuItem value="4">4 Stars</MenuItem>
                <MenuItem value="3">3 Stars</MenuItem>
                <MenuItem value="2">2 Stars</MenuItem>
                <MenuItem value="1">1 Star</MenuItem>
              </Select>
            </FormControl>
            <label style={{ fontSize: '14px', color: '#666' }}>Sort:</label>
            <select
              value={sortOrder}
              onChange={(e) => handleSortChange(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
            <button
              className={`btn btn-secondary ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <span style={{ fontSize: '18px' }}>▦</span> Grid
            </button>
            <button
              className={`btn btn-secondary ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <span style={{ fontSize: '18px' }}>☰</span> List
            </button>
            <div style={{ borderLeft: '1px solid #ddd', height: '24px', margin: '0 4px' }} />
            <Button
              variant="contained"
              size="small"
              onClick={() => startSlideshow(isRootLevel)}
              disabled={isRootLevel ? loadingSlideshow : (images.length === 0 || loadingSlideshow)}
              title={isRootLevel ? "Slideshow of all images" : "Slideshow of current folder"}
            >
              {loadingSlideshow ? <CircularProgress size={16} color="inherit" /> : 'Slideshow'}
            </Button>
          </div>
        </div>

        {/* Breadcrumb with Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="breadcrumb" style={{ flex: 1 }}>
          {breadcrumbs.length === 0 ? (
            <span style={{ color: '#999' }}>
              No repository path configured. Please set it in Settings.
            </span>
          ) : (
            breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={index}>
                  <span
                    className={`breadcrumb-item ${isLast ? 'active' : ''}`}
                    onClick={isLast ? undefined : () => navigateToPath(crumb.path)}
                    style={{ cursor: isLast ? 'default' : 'pointer' }}
                  >
                    {crumb.name}
                  </span>
                  {!isLast && <span className="breadcrumb-separator">/</span>}
                </span>
              );
            })
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {currentPath && (
            <button
              onClick={reloadDirectory}
              disabled={loading}
              style={{
                padding: '4px 10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                color: loading ? '#ccc' : '#333'
              }}
              title="Reload directory"
            >
              ↻
            </button>
          )}
          {siblingFolders.length > 0 && (
            <>
              <button
                onClick={navigateToPrevious}
                disabled={currentFolderIndex <= 0}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: currentFolderIndex <= 0 ? '#f5f5f5' : 'white',
                  cursor: currentFolderIndex <= 0 ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  color: currentFolderIndex <= 0 ? '#ccc' : '#333'
                }}
                title="Previous folder"
              >
                ‹‹
              </button>
              <button
                onClick={navigateToNext}
                disabled={currentFolderIndex >= siblingFolders.length - 1}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: currentFolderIndex >= siblingFolders.length - 1 ? '#f5f5f5' : 'white',
                  cursor: currentFolderIndex >= siblingFolders.length - 1 ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  color: currentFolderIndex >= siblingFolders.length - 1 ? '#ccc' : '#333'
                }}
                title="Next folder"
              >
                ››
              </button>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert error">{error}</div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {folders.length === 0 && images.length === 0 ? (
            <div className="alert info">This directory is empty.</div>
          ) : viewMode === 'grid' ? (
            <div className="image-repo-grid">
              {paginatedFolders.map(folder => (
                <div
                  key={folder.path}
                  className="repo-item folder"
                  onClick={() => navigateToPath(folder.path)}
                >
                  <div className="repo-item-preview folder-preview">
                    {folder.preview_images?.length > 0 ? (
                      <div className={`folder-collage collage-${Math.min(folder.preview_images.length, 3)}`}>
                        {folder.preview_images.slice(0, 3).map((imgPath, i) => (
                          <img
                            key={i}
                            src={API.getRepoImage(imgPath)}
                            alt=""
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const collage = e.target.parentElement;
                              const visibleImages = collage.querySelectorAll('img:not([style*="display: none"])');
                              if (visibleImages.length === 0) {
                                collage.classList.add('all-failed');
                              }
                            }}
                          />
                        ))}
                        <div className="folder-fallback">📁</div>
                      </div>
                    ) : (
                      <div className="folder-empty">📁</div>
                    )}
                  </div>
                  <div className="repo-item-name">{folder.name}</div>
                </div>
              ))}

              {images.map((image, index) => (
                <div
                  key={image.path}
                  className="repo-item image"
                  onClick={() => openImagePreview(image, index)}
                >
                  <div className="repo-item-preview">
                    <img
                      src={API.getRepoImage(image.path)}
                      alt={image.name}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3E🖼️%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <div className="repo-item-name">
                    {image.name}
                    {image.rating && (
                      <span style={{ marginLeft: '6px', color: '#f5a623' }}>
                        {'★'.repeat(image.rating)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="image-repo-list">
              {paginatedFolders.map(folder => (
                <div
                  key={folder.path}
                  className="repo-list-item folder"
                  onClick={() => navigateToPath(folder.path)}
                >
                  <span className="repo-list-icon">📁</span>
                  <span className="repo-list-name">{folder.name}</span>
                  <span className="repo-list-type">Folder</span>
                </div>
              ))}

              {images.map((image, index) => (
                <div
                  key={image.path}
                  className="repo-list-item image"
                  onClick={() => openImagePreview(image, index)}
                >
                  <span className="repo-list-icon">🖼️</span>
                  <span className="repo-list-name">
                    {image.name}
                    {image.rating && (
                      <span style={{ marginLeft: '8px', color: '#f5a623' }}>
                        {'★'.repeat(image.rating)}
                      </span>
                    )}
                  </span>
                  <span className="repo-list-type">
                    {image.name.split('.').pop().toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isRootLevel && folderPageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 2 }}>
              <Pagination
                count={folderPageCount}
                page={folderPage}
                onChange={handleFolderPageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      {showPreviewModal && selectedImage && (
        <ImagePreviewModal
          image={selectedImage}
          images={images}
          currentIndex={selectedImageIndex}
          onClose={handleClosePreview}
          onCreateJob={handleCreateJobFromPreview}
          onDelete={handleDeleteImage}
          onNavigate={handleNavigateImage}
        />
      )}

      {showJobModal && (
        <CreateJobModal
          preUploadedImageUrl={preUploadedImage}
          preUploadedDimensions={preUploadedDimensions}
          onClose={() => {
            setShowJobModal(false);
            setPreUploadedImage(null);
            setPreUploadedDimensions(null);
          }}
          onSuccess={(newJobId) => {
            setShowJobModal(false);
            setPreUploadedImage(null);
            setPreUploadedDimensions(null);
          }}
        />
      )}

      {/* Fullscreen Slideshow Mode */}
      {slideshowMode && currentSlideshowImage && (
        <div
          className="slideshow-overlay"
          onClick={toggleSlideshowPause}
          onMouseMove={handleSlideshowMouseMove}
        >
          <img
            key={currentSlideshowImage.path}
            src={API.getRepoImage(currentSlideshowImage.path)}
            alt={currentSlideshowImage.name}
            className="slideshow-image"
          />
          <div className="slideshow-info" style={{ opacity: slideshowShowControls ? 1 : 0 }}>
            <span className="slideshow-title">{currentSlideshowImage.name}</span>
            <span className="slideshow-counter">
              {slideshowHistory.length} / {slideshowImages.length}
            </span>
          </div>
          <div className="slideshow-hint" style={{ opacity: slideshowShowControls ? 1 : 0 }}>
            ← → Navigate | Space {slideshowPaused ? 'Play' : 'Pause'} | Del Delete | Esc Exit
          </div>
          <div
            className="slideshow-progress"
            style={{ width: `${slideshowProgress}%`, opacity: slideshowShowControls ? 1 : 0 }}
          />
          {slideshowPaused && (
            <div className="slideshow-paused-indicator" style={{ opacity: slideshowShowControls ? 0.8 : 0 }}>⏸</div>
          )}
        </div>
      )}
    </div>
  );
}
