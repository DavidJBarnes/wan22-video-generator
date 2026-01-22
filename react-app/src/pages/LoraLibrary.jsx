import { useState, useEffect } from 'react';
import { Button, Rating, CircularProgress, IconButton } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraEditModal from '../components/LoraEditModal';
import './LoraLibrary.css';

export default function LoraLibrary() {
  const [loras, setLoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLora, setEditingLora] = useState(null);

  useEffect(() => {
    loadLoras();
  }, []);

  async function loadLoras() {
    try {
      const data = await API.getLoraLibrary();
      setLoras(data.loras || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load LoRAs:', error);
      showToast('Failed to load LoRA library', 'error');
      setLoading(false);
    }
  }

  async function handleDelete(e, loraId, loraName) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${loraName}" from the library?`)) {
      return;
    }

    try {
      await API.deleteLora(loraId);
      showToast('LoRA deleted', 'success');
      await loadLoras();
    } catch (error) {
      console.error('Failed to delete LoRA:', error);
      showToast('Failed to delete LoRA', 'error');
    }
  }

  function handleEdit(lora) {
    setEditingLora(lora);
  }

  function handleCloseModal() {
    setEditingLora(null);
  }

  async function handleSaveModal() {
    setEditingLora(null);
    await loadLoras();
  }

  if (loading) {
    return (
      <div className="lora-library">
        <h1>LoRA Library</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div className="lora-library">
      <div className="lora-library-header">
        <h1>LoRA Library</h1>
        <span className="lora-count">{loras.length} LoRA{loras.length !== 1 ? 's' : ''}</span>
      </div>

      {loras.length === 0 ? (
        <div className="lora-empty">
          <p>No LoRAs cached yet.</p>
          <p>Go to Settings and click "Fetch LoRAs from ComfyUI" to populate the library.</p>
        </div>
      ) : (
        <div className="lora-grid">
          {loras.map((lora) => (
            <div key={lora.id} className="lora-card" onClick={() => handleEdit(lora)}>
              <div className="lora-card-preview">
                <img
                  src={API.getLoraPreviewUrl(lora.id)}
                  alt="Preview"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="lora-card-no-preview">
                  No preview
                </div>
              </div>

              <div className="lora-card-content">
                <div className="lora-card-name">
                  {lora.friendly_name || lora.base_name?.replace(/\{type\}/gi, '').replace(/[_-]+/g, ' ').trim() || 'Unnamed'}
                </div>

                <Rating value={lora.rating || 0} readOnly size="small" />

                <div className="lora-card-files">
                  {lora.high_file && (
                    <span className="file-tag high" title={lora.high_file}>
                      H: {lora.high_file.split('/').pop().substring(0, 25)}...
                    </span>
                  )}
                  {lora.low_file && (
                    <span className="file-tag low" title={lora.low_file}>
                      L: {lora.low_file.split('/').pop().substring(0, 25)}...
                    </span>
                  )}
                </div>

                {lora.trigger_keywords && (
                  <div className="lora-card-keywords" title={lora.trigger_keywords}>
                    {lora.trigger_keywords.length > 50
                      ? lora.trigger_keywords.substring(0, 50) + '...'
                      : lora.trigger_keywords}
                  </div>
                )}
              </div>

              <div className="lora-card-actions">
                {lora.url && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(lora.url, '_blank');
                    }}
                    title="Open CivitAI page"
                  >
                    <LinkIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(lora);
                  }}
                  title="Edit"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => handleDelete(e, lora.id, lora.friendly_name || lora.high_file?.split('/').pop() || 'this LoRA')}
                  title="Delete"
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingLora && (
        <LoraEditModal
          lora={editingLora}
          onClose={handleCloseModal}
          onSave={handleSaveModal}
        />
      )}
    </div>
  );
}
