import { useState, useEffect } from 'react';
import { Button, Rating } from '@mui/material';
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
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div>
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
                <th>Name</th>
                <th>Rating</th>
                <th>URL</th>
                <th>Trigger Keywords</th>
                <th style={{ width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loras.map((lora) => (
                <tr key={lora.id}>
                  <td>
                      {lora.friendly_name || ''}<br/>
                    <code style={{ fontSize: '13px', background: '#f5f5f5', padding: '2px', borderRadius: '3px' }}>
                      {lora.name}
                    </code>
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
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn-icon"
                        onClick={() => handleEdit(lora)}
                        title="Edit metadata"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon delete"
                        onClick={() => handleDelete(lora.id, lora.friendly_name || lora.name)}
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
