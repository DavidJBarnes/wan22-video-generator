import { useState, useEffect, useMemo } from 'react';
import { FormControl, InputLabel, Select, MenuItem, Pagination, Box } from '@mui/material';

const FOLDERS_PER_PAGE = 24;
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

  function handleCreateJobFromPreview(imageUrl) {
    // Close preview modal and open job modal
    setShowPreviewModal(false);
    setSelectedImage(null);
    setSelectedImageIndex(-1);
    setPreUploadedImage(imageUrl);
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

  return (
    <div>
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
        </div>
      </div>

      {/* Breadcrumb with Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {siblingFolders.length > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
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
          </div>
        )}
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
      </div>

      {/* Loading */}
      {loading && (
        <div className="alert info">Loading...</div>
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
          onClose={() => {
            setShowJobModal(false);
            setPreUploadedImage(null);
          }}
          onSuccess={(newJobId) => {
            setShowJobModal(false);
            setPreUploadedImage(null);
          }}
        />
      )}
    </div>
  );
}
