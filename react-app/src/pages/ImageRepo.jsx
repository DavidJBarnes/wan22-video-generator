import { useState, useEffect } from 'react';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import CreateJobModal from '../components/CreateJobModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import './ImageRepo.css';

export default function ImageRepo() {
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [showJobModal, setShowJobModal] = useState(false);
  const [preUploadedImage, setPreUploadedImage] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  async function loadDirectory(path) {
    setLoading(true);
    setError(null);

    try {
      const data = await API.browseImageRepo(path);

      // Sort items
      const sortedFolders = sortItems(data.folders || []);
      const sortedImages = sortItems(data.images || []);

      setFolders(sortedFolders);
      setImages(sortedImages);
      setBreadcrumbs(data.breadcrumbs || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load image repository:', err);
      setError(err.message || 'Failed to load directory. Please check that the Image Repository Path is set correctly in Settings.');
      setLoading(false);
    }
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const nameA = a.name;
      const nameB = b.name;

      // Check if names are date-formatted (YYYY-MM-DD)
      const datePatternA = nameA.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const datePatternB = nameB.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      // If both are date-formatted folders, sort chronologically
      if (datePatternA && datePatternB) {
        // YYYY-MM-DD format is already sortable by string comparison
        if (sortOrder === 'name-asc') {
          return nameA.localeCompare(nameB);  // Chronological order
        } else if (sortOrder === 'name-desc') {
          return nameB.localeCompare(nameA);  // Reverse chronological
        }
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

  function openImagePreview(image) {
    setSelectedImage(image);
    setShowPreviewModal(true);
  }

  function handleClosePreview() {
    setShowPreviewModal(false);
    setSelectedImage(null);
  }

  function handleCreateJobFromPreview(imageUrl) {
    // Close preview modal and open job modal
    setShowPreviewModal(false);
    setSelectedImage(null);
    setPreUploadedImage(imageUrl);
    setShowJobModal(true);
  }

  function handleDeleteImage() {
    // Close preview modal and reload directory
    setShowPreviewModal(false);
    setSelectedImage(null);
    loadDirectory(currentPath);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>Image Repository</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

      {/* Breadcrumb */}
      <div className="breadcrumb">
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
              {folders.map(folder => (
                <div
                  key={folder.path}
                  className="repo-item folder"
                  onClick={() => navigateToPath(folder.path)}
                >
                  <div className="repo-item-icon">📁</div>
                  <div className="repo-item-name">{folder.name}</div>
                </div>
              ))}

              {images.map(image => (
                <div
                  key={image.path}
                  className="repo-item image"
                  onClick={() => openImagePreview(image)}
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
                  <div className="repo-item-name">{image.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="image-repo-list">
              {folders.map(folder => (
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

              {images.map(image => (
                <div
                  key={image.path}
                  className="repo-list-item image"
                  onClick={() => openImagePreview(image)}
                >
                  <span className="repo-list-icon">🖼️</span>
                  <span className="repo-list-name">{image.name}</span>
                  <span className="repo-list-type">
                    {image.name.split('.').pop().toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showPreviewModal && selectedImage && (
        <ImagePreviewModal
          image={selectedImage}
          onClose={handleClosePreview}
          onCreateJob={handleCreateJobFromPreview}
          onDelete={handleDeleteImage}
        />
      )}

      {showJobModal && (
        <CreateJobModal
          preUploadedImageUrl={preUploadedImage}
          onClose={() => {
            setShowJobModal(false);
            setPreUploadedImage(null);
          }}
          onSuccess={() => {
            setShowJobModal(false);
            setPreUploadedImage(null);
          }}
        />
      )}
    </div>
  );
}
