import { Autocomplete, TextField } from '@mui/material';

export default function LoraAutocomplete({ label, value, onChange, loras }) {
  return (
    <Autocomplete
      value={value || null}
      onChange={(event, newValue) => {
        onChange(newValue || '');
      }}
      inputValue={value || ''}
      onInputChange={(event, newInputValue) => {
        onChange(newInputValue || '');
      }}
      options={loras}
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
