import { useState, useEffect } from 'react';
import { Button, Rating, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraEditModal from '../components/LoraEditModal';
import './LoraLibrary.css';

// Clean up base_name by removing {TYPE} placeholder
function cleanBaseName(baseName) {
  if (!baseName) return '';
  return baseName.replace(/\{type\}/gi, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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

  async function handleDelete(loraId, loraName) {
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
      <div>
        <h1>LoRA Library</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div className="lora-library">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>LoRA Library</h1>
        <p style={{ color: '#666' }}>{loras.length} LoRA{loras.length !== 1 ? 's' : ''} cached</p>
      </div>

      {loras.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#999', margin: '0 0 16px 0' }}>
            No LoRAs cached yet. Go to Settings and click "Fetch LoRAs from ComfyUI" to populate the library.
          </p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Preview</th>
                <th>Name</th>
                <th>Rating</th>
                <th>URL</th>
                <th>Trigger Keywords</th>
                <th style={{ width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loras.map((lora) => (
                <tr key={lora.id} onClick={() => handleEdit(lora)} style={{ cursor: 'pointer' }}>
                  <td style={{ padding: '4px' }}>
                    <img
                      src={API.getLoraPreviewUrl(lora.id)}
                      alt="Preview"
                      style={{
                        width: '60px',
                        height: '60px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        backgroundColor: '#f0f0f0'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div style={{
                      width: '60px',
                      height: '60px',
                      backgroundColor: '#f0f0f0',
                      borderRadius: '4px',
                      display: 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#999',
                      fontSize: '10px'
                    }}>
                      No preview
                    </div>
                  </td>
                  <td>
                    <div>
                      {lora.friendly_name ? (
                        <strong>{lora.friendly_name}</strong>
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {lora.high_file && (
                        <span style={{ color: '#2e7d32' }} title={lora.high_file}>
                          H: {lora.high_file.split('/').pop()}
                        </span>
                      )}
                      {lora.low_file && (
                        <span style={{ color: '#1565c0' }} title={lora.low_file}>
                          L: {lora.low_file.split('/').pop()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Rating value={lora.rating || 0} readOnly size="small" />
                  </td>
                  <td>
                    {lora.url ? (
                      <a href={lora.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px' }}>
                        Link
                      </a>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td>
                    {lora.trigger_keywords ? (
                      <span style={{ fontSize: '13px' }}>{lora.trigger_keywords}</span>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn-icon delete"
                        onClick={() => handleDelete(lora.id, lora.friendly_name || lora.high_file?.split('/').pop() || 'this LoRA')}
                        title="Delete from library"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
