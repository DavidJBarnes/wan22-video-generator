import { useState } from 'react';
import { Box, Pagination, TextField, Typography, FormControl, Select, MenuItem } from '@mui/material';

/**
 * Reusable pagination component with consistent styling across the app.
 * Features:
 * - Numbered page buttons with first/last navigation
 * - Jump to page input
 * - Optional items per page selector
 * - Item count display
 */
export default function PaginationControl({
  count,           // Total number of items
  page,            // Current page (1-indexed)
  pageSize,        // Items per page
  onPageChange,    // (event, newPage) => void - newPage is 1-indexed
  onPageSizeChange, // (newPageSize) => void - optional
  pageSizeOptions = [10, 25, 50, 100], // Options for items per page
  showPageSize = false,  // Whether to show the page size selector
  itemLabel = 'items'    // Label for items (e.g., "jobs", "images")
}) {
  const [jumpValue, setJumpValue] = useState('');

  const pageCount = Math.ceil(count / pageSize);

  // Calculate display range
  const startItem = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, count);

  function handleJumpSubmit(e) {
    e.preventDefault();
    const targetPage = parseInt(jumpValue, 10);
    if (targetPage >= 1 && targetPage <= pageCount) {
      onPageChange(e, targetPage);
      setJumpValue('');
    }
  }

  function handleJumpKeyDown(e) {
    if (e.key === 'Enter') {
      handleJumpSubmit(e);
    }
  }

  if (pageCount <= 1 && !showPageSize) {
    // Don't show pagination if there's only one page and no page size selector
    return null;
  }

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 3,
      mt: 3,
      mb: 2,
      flexWrap: 'wrap'
    }}>
      {/* Item count */}
      <Typography sx={{ color: '#666', fontSize: '14px' }}>
        {count === 0
          ? `0 ${itemLabel}`
          : `${startItem}-${endItem} of ${count} ${itemLabel}`
        }
      </Typography>

      {/* Page size selector */}
      {showPageSize && onPageSizeChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ color: '#666', fontSize: '14px' }}>
            Per page:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 70 }}>
            <Select
              value={pageSize}
              onChange={(e) => onPageSizeChange(e.target.value)}
              sx={{ fontSize: '14px' }}
            >
              {pageSizeOptions.map(option => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Pagination buttons */}
      {pageCount > 1 && (
        <Pagination
          count={pageCount}
          page={page}
          onChange={onPageChange}
          color="primary"
          showFirstButton
          showLastButton
        />
      )}

      {/* Jump to page */}
      {pageCount > 1 && (
        <Box
          component="form"
          onSubmit={handleJumpSubmit}
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <Typography sx={{ color: '#666', fontSize: '14px' }}>
            Go to:
          </Typography>
          <TextField
            size="small"
            type="number"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={handleJumpKeyDown}
            placeholder={String(page)}
            inputProps={{
              min: 1,
              max: pageCount,
              style: { width: '50px', textAlign: 'center' }
            }}
            sx={{
              '& .MuiInputBase-input': {
                padding: '6px 8px',
                fontSize: '14px'
              }
            }}
          />
        </Box>
      )}
    </Box>
  );
}
