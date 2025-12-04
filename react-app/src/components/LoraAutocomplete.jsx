import { Autocomplete, TextField } from '@mui/material';

export default function LoraAutocomplete({ label, value, onChange, loras }) {
  // Convert loras array to objects if they're strings (for backward compatibility)
  const loraOptions = loras.map(lora => {
    if (typeof lora === 'string') {
      return { name: lora, friendly_name: null };
    }
    return lora;
  });

  // Find the current lora object from value
  const currentLora = loraOptions.find(l => l.name === value) || null;

  return (
    <Autocomplete
      value={currentLora}
      onChange={(event, newValue) => {
        // When a selection is made, return the technical name
        if (newValue && typeof newValue === 'object') {
          onChange(newValue.name || '');
        } else if (typeof newValue === 'string') {
          onChange(newValue);
        } else {
          onChange('');
        }
      }}
      inputValue={value || ''}
      onInputChange={(event, newInputValue, reason) => {
        // Only update for typing, not for reset
        if (reason === 'input') {
          onChange(newInputValue || '');
        }
      }}
      options={loraOptions}
      getOptionLabel={(option) => {
        if (typeof option === 'string') return option;
        return option.friendly_name || option.name || '';
      }}
      renderOption={(props, option) => {
        const displayName = option.friendly_name || option.name;
        const isCustom = option.friendly_name && option.friendly_name !== option.name;

        return (
          <li {...props} key={option.id || option.name}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ fontWeight: isCustom ? 500 : 400 }}>
                {displayName}
              </div>
              {isCustom && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {option.name}
                </div>
              )}
            </div>
          </li>
        );
      }}
      freeSolo
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
