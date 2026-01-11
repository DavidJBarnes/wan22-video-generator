import { useState, useEffect, useRef } from 'react';
import { Button, Rating, Box, Typography, CircularProgress, FormControl, InputLabel, Select, MenuItem, Chip } from '@mui/material';
import { Link } from 'react-router-dom';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

export default function ImagePreviewModal({ image, images, currentIndex, onClose, onCreateJob, onDelete, onNavigate }) {
  const [deleting, setDeleting] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [rating, setRating] = useState(image.rating || null);
  const [relatedJobs, setRelatedJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const imageRef = useRef(null);

  // Tag state
  const [availableTags, setAvailableTags] = useState([]);
  const [imageTags, setImageTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Lock scroll on .main-content when modal is open
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      const originalOverflow = mainContent.style.overflow;
      mainContent.style.overflow = 'hidden';
      return () => {
        mainContent.style.overflow = originalOverflow;
      };
    }
  }, []);

  // Update rating when image changes
  useEffect(() => {
    setRating(image.rating || null);
  }, [image]);

  // Fetch related jobs when image changes
  useEffect(() => {
    async function loadRelatedJobs() {
      setLoadingJobs(true);
      try {
        const data = await API.getJobsForImage(image.name);
        setRelatedJobs(data.jobs || []);
      } catch (error) {
        console.error('Failed to load related jobs:', error);
        setRelatedJobs([]);
      }
      setLoadingJobs(false);
    }
    loadRelatedJobs();
  }, [image.name]);

  // Load available tags once
  useEffect(() => {
    async function loadAvailableTags() {
      try {
        const data = await API.getImageTags();
        setAvailableTags(data.tags || []);
      } catch (error) {
        console.error('Failed to load available tags:', error);
      }
    }
    loadAvailableTags();
  }, []);

  // Load image's tags when image changes
  useEffect(() => {
    async function loadImageTags() {
      setLoadingTags(true);
      try {
        const data = await API.getTagsForImage(image.path);
        setImageTags(data.tags || []);
      } catch (error) {
        console.error('Failed to load image tags:', error);
        setImageTags([]);
      }
      setLoadingTags(false);
    }
    loadImageTags();
  }, [image.path]);

  async function handleAddTag(tagName) {
    if (!tagName) return;
    try {
      await API.addTagToImage(image.path, tagName);
      // Refresh image tags
      const data = await API.getTagsForImage(image.path);
      setImageTags(data.tags || []);
    } catch (error) {
      console.error('Failed to add tag:', error);
      showToast('Failed to add tag', 'error');
    }
  }

  async function handleRemoveTag(tagName) {
    try {
      await API.removeTagFromImage(image.path, tagName);
      // Refresh image tags
      const data = await API.getTagsForImage(image.path);
      setImageTags(data.tags || []);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      showToast('Failed to remove tag', 'error');
    }
  }

  // Get tags that are not yet applied to this image
  const unassignedTags = availableTags.filter(
    tag => !imageTags.some(imgTag => imgTag.name === tag.name)
  );

  // Keyboard navigation and shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (deleting || creatingJob) return;

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Delete') {
        handleDelete();
      } else if (e.key >= '1' && e.key <= '5') {
        handleRatingChange(null, parseInt(e.key));
      } else if (e.key === '0') {
        handleRatingChange(null, null); // Clear rating
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, deleting, creatingJob, onNavigate, onClose]);

  async function handleDelete() {
    setDeleting(true);

    try {
      await API.deleteRepoImage(image.path);
      onDelete(); // Parent handles navigation to next image
    } catch (error) {
      console.error('Failed to delete image:', error);
      showToast('Failed to delete image', 'error');
    }
    setDeleting(false);
  }

  async function handleCreateJob() {
    setCreatingJob(true);

    try {
      showToast('Uploading image...', 'info');
      const data = await API.selectImageFromRepo(image.path);
      showToast('Image uploaded successfully!', 'success');

      // Get dimensions from the already-displayed image element
      let dimensions = { width: 768, height: 512 }; // Default to landscape
      if (imageRef.current) {
        const naturalW = imageRef.current.naturalWidth;
        const naturalH = imageRef.current.naturalHeight;
        console.log('[ImagePreviewModal] Image natural dimensions:', naturalW, 'x', naturalH);
        if (naturalW && naturalH) {
          const isLandscape = naturalW > naturalH;
          dimensions = isLandscape
            ? { width: 768, height: 512 }
            : { width: 512, height: 768 };
          console.log('[ImagePreviewModal] Setting dimensions:', dimensions, 'isLandscape:', isLandscape);
        } else {
          console.log('[ImagePreviewModal] naturalWidth/Height not available, using defaults');
        }
      } else {
        console.log('[ImagePreviewModal] imageRef.current is null');
      }
      onCreateJob(data.image_url, dimensions);
    } catch (error) {
      console.error('Failed to select image:', error);
      showToast(error.message || 'Failed to upload image', 'error');
      setCreatingJob(false);
    }
  }

  async function handleRatingChange(event, newValue) {
    setRating(newValue);
    try {
      await API.setImageRating(image.path, newValue);
    } catch (error) {
      console.error('Failed to set rating:', error);
      showToast('Failed to save rating', 'error');
    }
  }

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '90vw' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: '14px', fontFamily: 'monospace', opacity: 0.9 }}>{image.path}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', gap: '24px', padding: '16px 24px' }}>
          {/* Left Side - Image Preview */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Image Preview */}
            <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                ref={imageRef}
                src={API.getRepoImage(image.path)}
                alt={image.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '55vh',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2224%22%3EImage not found%3C/text%3E%3C/svg%3E';
                }}
              />
            </div>
          </div>

          {/* Right Side Panel */}
          <div style={{
            width: '220px',
            flexShrink: 0,
            borderLeft: '1px solid #e0e0e0',
            paddingLeft: '24px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Rating */}
            <div style={{ marginBottom: '16px' }}>
              <Typography variant="subtitle2" sx={{ fontSize: '12px', color: '#666', mb: 1 }}>
                Rating
              </Typography>
              <Rating
                value={rating}
                onChange={handleRatingChange}
                size="medium"
              />
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '16px' }}>
              <Typography variant="subtitle2" sx={{ fontSize: '12px', color: '#666', mb: 1 }}>
                Tags
              </Typography>
              {loadingTags ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : (
                <>
                  {/* Tag pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: imageTags.length > 0 ? '8px' : 0 }}>
                    {imageTags.map(tag => (
                      <Chip
                        key={tag.name}
                        label={tag.name}
                        size="small"
                        onDelete={() => handleRemoveTag(tag.name)}
                        sx={{ height: '24px' }}
                      />
                    ))}
                  </div>
                  {/* Add tag dropdown */}
                  {unassignedTags.length > 0 && (
                    <FormControl size="small" fullWidth sx={{ mt: imageTags.length > 0 ? 0 : 0 }}>
                      <InputLabel>Add tag</InputLabel>
                      <Select
                        value=""
                        label="Add tag"
                        onChange={(e) => handleAddTag(e.target.value)}
                        sx={{ fontSize: '13px' }}
                      >
                        {unassignedTags.map(tag => (
                          <MenuItem key={tag.name} value={tag.name} sx={{ fontSize: '13px' }}>
                            {tag.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  {availableTags.length === 0 && (
                    <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic', fontSize: '12px' }}>
                      No tags available. Add prefixes/descriptions in Settings.
                    </Typography>
                  )}
                </>
              )}
            </div>

            {/* Jobs Using This Image */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
              <Typography variant="subtitle2" sx={{ fontSize: '12px', color: '#666', mb: 1 }}>
                Jobs Using This Image
              </Typography>
              {loadingJobs ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : relatedJobs.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic', fontSize: '13px' }}>
                  No jobs found
                </Typography>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '120px' }}>
                  {relatedJobs.map(job => (
                    <Link
                      key={job.id}
                      to={`/job/${job.id}`}
                      onClick={onClose}
                      style={{
                        textDecoration: 'none',
                        color: '#1976d2',
                        fontSize: '13px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: '#f5f5f5',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={job.name}
                    >
                      {job.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button
                variant="contained"
                fullWidth
                onClick={handleCreateJob}
                disabled={deleting || creatingJob}
              >
                {creatingJob ? <CircularProgress size={20} color="inherit" /> : 'New Job'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                fullWidth
                onClick={handleDelete}
                disabled={deleting || creatingJob}
              >
                {deleting ? 'Deleting...' : 'Delete Image'}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer with Navigation */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={!hasPrev || deleting || creatingJob}
          >
            ← Prev
          </Button>
          <Typography sx={{ color: '#666', fontSize: '14px', alignSelf: 'center' }}>
            {currentIndex + 1} / {images.length}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={!hasNext || deleting || creatingJob}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
