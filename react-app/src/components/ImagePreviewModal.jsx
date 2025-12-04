import { useState } from 'react';
import { Button } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

export default function ImagePreviewModal({ image, onClose, onCreateJob, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${image.name}"? This will permanently remove the file from the filesystem.`)) {
      return;
    }

    setDeleting(true);

    try {
      await API.deleteRepoImage(image.path);
      showToast('Image deleted successfully', 'success');
      onDelete();
    } catch (error) {
      console.error('Failed to delete image:', error);
      showToast('Failed to delete image', 'error');
      setDeleting(false);
    }
  }

  async function handleCreateJob() {
    setCreatingJob(true);

    try {
      showToast('Uploading image...', 'info');
      const data = await API.selectImageFromRepo(image.path);
      showToast('Image uploaded successfully!', 'success');
      onCreateJob(data.image_url);
    } catch (error) {
      console.error('Failed to select image:', error);
      showToast(error.message || 'Failed to upload image', 'error');
      setCreatingJob(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
        <h2 style={{ marginTop: 0 }}>{image.name}</h2>

        {/* Image Preview */}
        <div style={{ marginBottom: '24px', textAlign: 'center', maxHeight: '60vh', overflow: 'auto' }}>
          <img
            src={API.getRepoImage(image.path)}
            alt={image.name}
            style={{
              maxWidth: '100%',
              maxHeight: '60vh',
              objectFit: 'contain',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2224%22%3EImage not found%3C/text%3E%3C/svg%3E';
            }}
          />
        </div>

        {/* Path Info */}
        <div style={{ marginBottom: '24px', padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
          <strong style={{ fontSize: '12px', color: '#666' }}>Path:</strong>
          <div style={{ marginTop: '4px', fontSize: '13px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {image.path}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting || creatingJob}
          >
            {deleting ? 'Deleting...' : 'Delete Image'}
          </Button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={deleting || creatingJob}
            >
              Close
            </Button>
            <Button
              variant="contained"
              onClick={handleCreateJob}
              disabled={deleting || creatingJob}
            >
              {creatingJob ? 'Loading...' : 'New Job from Image'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
