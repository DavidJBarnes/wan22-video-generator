import { Autocomplete, TextField } from '@mui/material';
import API from '../api/client';

// Clean up base_name by removing {TYPE} placeholder
function cleanBaseName(baseName) {
  if (!baseName) return '';
  return baseName.replace(/\{type\}/gi, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function LoraAutocomplete({ label, value, onChange, loras }) {
  // value is now the full LoRA object (or null)
  // loras are grouped LoRA objects with base_name, high_file, low_file

  return (
    <Autocomplete
      value={value}
      onChange={(event, newValue) => {
        // Pass the full LoRA object (or null) back to parent
        onChange(newValue);
      }}
      options={loras}
      getOptionLabel={(option) => {
        if (!option) return '';
        return option.friendly_name || cleanBaseName(option.base_name) || '';
      }}
      isOptionEqualToValue={(option, value) => {
        if (!option || !value) return false;
        return option.id === value.id;
      }}
      renderOption={(props, option, { index }) => {
        const cleanedBaseName = cleanBaseName(option.base_name);
        const displayName = option.friendly_name || cleanedBaseName;
        const hasCustomName = option.friendly_name && option.friendly_name !== cleanedBaseName;
        const hasBothFiles = option.high_file && option.low_file;
        const isEven = index % 2 === 0;

        return (
          <li
            {...props}
            key={option.id}
            style={{
              ...props.style,
              backgroundColor: isEven ? '#fff' : '#f8f9fa',
              padding: '8px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              {/* Thumbnail */}
              <img
                src={API.getLoraPreviewUrl(option.id)}
                alt=""
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
      }}
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
