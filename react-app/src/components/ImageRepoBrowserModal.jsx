import { useState, useEffect } from 'react';
import { CircularProgress, Button, Pagination, Box } from '@mui/material';
import API from '../api/client';
import LazyImage from './LazyImage';
import './CreateJobModal.css';

const IMAGES_PER_PAGE = 24;

export default function ImageRepoBrowserModal({ onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imagePage, setImagePage] = useState(1);

  useEffect(() => {
    loadDirectory(currentPath);
    setImagePage(1); // Reset page when navigating
  }, [currentPath]);

  // Pagination for images
  const imagePageCount = Math.ceil(images.length / IMAGES_PER_PAGE);
  const paginatedImages = images.slice((imagePage - 1) * IMAGES_PER_PAGE, imagePage * IMAGES_PER_PAGE);

  async function loadDirectory(path) {
    setLoading(true);
    setError(null);

    try {
      const data = await API.browseImageRepo(path);

      // Sort folders alphabetically, with date folders (YYYY-MM-DD) newest first
      const sortedFolders = (data.folders || []).sort((a, b) => {
        const datePatternA = a.name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const datePatternB = b.name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (datePatternA && datePatternB) {
          return b.name.localeCompare(a.name); // Newest first
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      // Sort images alphabetically
      const sortedImages = (data.images || []).sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );

      setFolders(sortedFolders);
      setImages(sortedImages);
      setBreadcrumbs(data.breadcrumbs || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load image repository:', err);
      setError(err.message || 'Failed to load directory');
      setLoading(false);
    }
  }

  function handleFolderClick(folder) {
    setCurrentPath(folder.path);
  }

  function handleImageClick(image) {
    onSelect(image.path);
  }

  function navigateToPath(path) {
    setCurrentPath(path);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div className="modal-header">
          <h2>Select Start Image</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Breadcrumb navigation */}
          <div style={{ marginBottom: '16px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={index}>
                  <span
                    onClick={isLast ? undefined : () => navigateToPath(crumb.path)}
                    style={{
                      cursor: isLast ? 'default' : 'pointer',
                      color: isLast ? '#333' : '#1976d2',
                      fontWeight: isLast ? 'bold' : 'normal'
                    }}
                  >
                    {crumb.name}
                  </span>
                  {!isLast && <span style={{ margin: '0 4px', color: '#999' }}>/</span>}
                </span>
              );
            })}
          </div>

          {/* Content area */}
          <div style={{ minHeight: '300px' }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <CircularProgress />
              </div>
            )}

            {error && (
              <div style={{ color: '#d32f2f', padding: '16px', background: '#ffebee', borderRadius: '4px' }}>
                {error}
              </div>
            )}

            {!loading && !error && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {/* Folders */}
                {folders.map(folder => (
                  <div
                    key={folder.path}
                    onClick={() => handleFolderClick(folder)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      textAlign: 'center',
                      background: '#fafafa',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#e3f2fd'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#fafafa'}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '4px' }}>
                      {folder.preview_images?.length > 0 ? (
                        <LazyImage
                          src={API.getRepoThumbnail(folder.preview_images[0], 100)}
                          alt=""
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        />
                      ) : null}
                      <span style={{ display: folder.preview_images?.length > 0 ? 'none' : 'block' }}>&#x1F4C1;</span>
                    </div>
                    <div style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {folder.name}
                    </div>
                  </div>
                ))}

                {/* Images - large preview with clear aspect ratio */}
                {paginatedImages.map(image => (
                  <div
                    key={image.path}
                    onClick={() => handleImageClick(image)}
                    style={{
                      cursor: 'pointer',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s, transform 0.2s',
                      background: '#222'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#1976d2'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                      <LazyImage
                        src={API.getRepoThumbnail(image.path, 200)}
                        alt={image.name}
                        style={{ maxWidth: '100%', maxHeight: '172px', objectFit: 'contain', borderRadius: '4px' }}
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3E?%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    </div>
                    <div style={{ padding: '4px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#fafafa' }}>
                      {image.name}
                    </div>
                  </div>
                ))}

                {folders.length === 0 && images.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: '40px' }}>
                    This directory is empty
                  </div>
                )}
              </div>
            )}

            {/* Image pagination */}
            {!loading && !error && imagePageCount > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                <span style={{ color: '#666', fontSize: '12px' }}>
                  {images.length} images
                </span>
                <Pagination
                  count={imagePageCount}
                  page={imagePage}
                  onChange={(e, value) => setImagePage(value)}
                  color="primary"
                  size="small"
                />
              </Box>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
