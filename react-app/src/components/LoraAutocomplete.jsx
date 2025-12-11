import { Autocomplete, TextField } from '@mui/material';

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
      renderOption={(props, option) => {
        const cleanedBaseName = cleanBaseName(option.base_name);
        const displayName = option.friendly_name || cleanedBaseName;
        const hasCustomName = option.friendly_name && option.friendly_name !== cleanedBaseName;
        const hasBothFiles = option.high_file && option.low_file;

        return (
          <li {...props} key={option.id}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ fontWeight: hasCustomName ? 500 : 400, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {displayName}
                {!hasBothFiles && (
                  <span style={{ fontSize: '10px', color: '#f57c00', background: '#fff3e0', padding: '1px 4px', borderRadius: '2px' }}>
                    {option.high_file ? 'HIGH only' : 'LOW only'}
                  </span>
                )}
              </div>
              {hasCustomName && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {cleanedBaseName}
                </div>
              )}
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
