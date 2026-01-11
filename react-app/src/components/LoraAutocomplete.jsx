import { memo, useMemo, useCallback } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import API from '../api/client';

// Clean up base_name by removing {TYPE} placeholder - memoize this at module level
const cleanBaseNameCache = new Map();
function cleanBaseName(baseName) {
  if (!baseName) return '';
  if (cleanBaseNameCache.has(baseName)) {
    return cleanBaseNameCache.get(baseName);
  }
  const cleaned = baseName.replace(/\{type\}/gi, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  cleanBaseNameCache.set(baseName, cleaned);
  return cleaned;
}

// Memoized option renderer component to prevent re-renders
const LoraOption = memo(function LoraOption({ option, index, props }) {
  const cleanedBaseName = useMemo(() => cleanBaseName(option.base_name), [option.base_name]);
  const displayName = option.friendly_name || cleanedBaseName;
  const hasCustomName = option.friendly_name && option.friendly_name !== cleanedBaseName;
  const hasBothFiles = option.high_file && option.low_file;

  return (
    <li
      {...props}
      key={option.id}
      style={{
        ...props.style,
        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
        padding: '8px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
        {/* Thumbnail */}
        <img
          src={API.getLoraPreviewUrl(option.id)}
          alt=""
          loading="lazy"
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'cover',
            borderRadius: '4px',
            backgroundColor: '#e0e0e0',
            flexShrink: 0,
          }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        {/* Text content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: hasCustomName ? 500 : 400, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            {!hasBothFiles && (
              <span style={{ fontSize: '10px', color: '#f57c00', background: '#fff3e0', padding: '1px 4px', borderRadius: '2px', flexShrink: 0 }}>
                {option.high_file ? 'HIGH only' : 'LOW only'}
              </span>
            )}
          </div>
          {hasCustomName && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cleanedBaseName}
            </div>
          )}
        </div>
      </div>
    </li>
  );
});

function LoraAutocomplete({ label, value, onChange, loras }) {
  // Memoize the getOptionLabel function
  const getOptionLabel = useCallback((option) => {
    if (!option) return '';
    return option.friendly_name || cleanBaseName(option.base_name) || '';
  }, []);

  // Memoize the isOptionEqualToValue function
  const isOptionEqualToValue = useCallback((option, value) => {
    if (!option || !value) return false;
    return option.id === value.id;
  }, []);

  // Memoize the onChange handler
  const handleChange = useCallback((event, newValue) => {
    onChange(newValue);
  }, [onChange]);

  // Memoize the renderOption function
  const renderOption = useCallback((props, option, { index }) => (
    <LoraOption props={props} option={option} index={index} />
  ), []);

  return (
    <Autocomplete
      value={value}
      onChange={handleChange}
      options={loras}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={isOptionEqualToValue}
      renderOption={renderOption}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search or select LoRA..."
          variant="outlined"
          size="small"
        />
      )}
      sx={{
        '& .MuiOutlinedInput-root': {
          padding: '4px',
        }
      }}
    />
  );
}

// Export memoized component with custom comparison
export default memo(LoraAutocomplete, (prevProps, nextProps) => {
  // Only re-render if these props actually changed
  return (
    prevProps.value?.id === nextProps.value?.id &&
    prevProps.label === nextProps.label &&
    prevProps.loras === nextProps.loras &&
    prevProps.onChange === nextProps.onChange
  );
});
