import { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './Prompts.css';

export default function Prompts() {
  const [promptLists, setPromptLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [listToDelete, setListToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    loadPromptLists();
  }, []);

  async function loadPromptLists() {
    try {
      const data = await API.getPromptLists();
      setPromptLists(data.prompt_lists || []);
    } catch (error) {
      console.error('Failed to load prompt lists:', error);
      showToast('Failed to load prompt lists', 'error');
    } finally {
      setLoading(false);
    }
  }

  function validateName(value) {
    if (!value) {
      return 'Name is required';
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
      return 'Name must start with a letter and contain only letters, numbers, underscores, and dashes';
    }
    // Check for duplicate (case-insensitive), excluding current edit
    const isDuplicate = promptLists.some(
      list => list.name.toLowerCase() === value.toLowerCase() &&
        (!editingList || list.id !== editingList.id)
    );
    if (isDuplicate) {
      return 'A list with this name already exists';
    }
    return '';
  }

  function handleNameChange(value) {
    setName(value);
    setNameError(validateName(value));
  }

  function openCreateDialog() {
    setEditingList(null);
    setName('');
    setItemsText('');
    setNameError('');
    setDialogOpen(true);
  }

  function openEditDialog(list) {
    setEditingList(list);
    setName(list.name);
    setItemsText(list.items.join('\n'));
    setNameError('');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingList(null);
  }

  function openDeleteDialog(list) {
    setListToDelete(list);
    setDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    setDeleteDialogOpen(false);
    setListToDelete(null);
  }

  async function handleSave() {
    // Parse items from textarea (one per line, ignore empty lines)
    const items = itemsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (items.length === 0) {
      showToast('Please add at least one item', 'error');
      return;
    }

    const error = validateName(name);
    if (error) {
      setNameError(error);
      return;
    }

    setSaving(true);
    try {
      if (editingList) {
        await API.updatePromptList(editingList.id, { name, items });
        showToast('Prompt list updated', 'success');
      } else {
        await API.createPromptList(name, items);
        showToast('Prompt list created', 'success');
      }
      closeDialog();
      loadPromptLists();
    } catch (error) {
      console.error('Failed to save prompt list:', error);
      showToast(error.message || 'Failed to save prompt list', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!listToDelete) return;

    try {
      await API.deletePromptList(listToDelete.id);
      showToast('Prompt list deleted', 'success');
      closeDeleteDialog();
      loadPromptLists();
    } catch (error) {
      console.error('Failed to delete prompt list:', error);
      showToast('Failed to delete prompt list', 'error');
    }
  }

  function getItemsPreview(items, maxItems = 3) {
    if (items.length <= maxItems) {
      return items.join(', ');
    }
    return items.slice(0, maxItems).join(', ') + ', ...';
  }

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Prompt Lists</h1>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
        >
          Create New List
        </Button>
      </div>

      <p className="page-description">
        Create reusable prompt lists that can be used as tags in your prompts.
        Use <code>&lt;list_name&gt;</code> in any prompt to randomly select an item from that list.
      </p>

      {promptLists.length === 0 ? (
        <div className="empty-state">
          <p>No prompt lists yet. Create your first list to get started.</p>
        </div>
      ) : (
        <div className="prompt-lists-grid">
          {promptLists.map(list => (
            <div key={list.id} className="prompt-list-card card">
              <div className="prompt-list-header">
                <div className="prompt-list-name">
                  <code>&lt;{list.name}&gt;</code>
                </div>
                <div className="prompt-list-actions">
                  <IconButton
                    size="small"
                    onClick={() => openEditDialog(list)}
                    title="Edit"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => openDeleteDialog(list)}
                    title="Delete"
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </div>
              </div>
              <div className="prompt-list-count">
                {list.items.length} item{list.items.length !== 1 ? 's' : ''}
              </div>
              <div className="prompt-list-preview">
                {getItemsPreview(list.items)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingList ? 'Edit Prompt List' : 'Create Prompt List'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="List Name"
            fullWidth
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            error={!!nameError}
            helperText={nameError || 'Used as tag: <name> in prompts'}
            placeholder="e.g., arm_positions"
          />
          <TextField
            margin="dense"
            label="Items (one per line)"
            fullWidth
            multiline
            rows={10}
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            placeholder="arms raised above head&#10;hands on hips&#10;arms crossed&#10;one hand behind head"
            helperText="Enter each item on a separate line. Empty lines will be ignored."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || !!nameError || !name || !itemsText.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
      >
        <DialogTitle>Delete Prompt List</DialogTitle>
        <DialogContent>
          Delete prompt list "{listToDelete?.name}"? This cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
