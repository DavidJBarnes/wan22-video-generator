import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  pending: { color: 'default', label: 'Pending' },
  running: { color: 'primary', label: 'Running' },
  awaiting_prompt: { color: 'warning', label: 'Awaiting Prompt' },
  completed: { color: 'success', label: 'Completed' },
  failed: { color: 'error', label: 'Failed' },
  cancelled: { color: 'default', label: 'Cancelled' },
};

export default function StatusChip({ status }) {
  const config = STATUS_CONFIG[status] || { color: 'default', label: status };

  return (
    <Chip
      label={config.label}
      color={config.color}
      size="small"
      sx={{ fontWeight: 500 }}
    />
  );
}
