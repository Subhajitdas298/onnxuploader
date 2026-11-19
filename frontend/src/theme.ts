import { createTheme } from '@mui/material/styles';

const mono = '"Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2548c7' },
        background: { default: '#f4f6fb', paper: '#ffffff' },
        text: { primary: '#172033', secondary: '#556079' },
        divider: '#dde2ee',
        success: { main: '#17703f' },
        error: { main: '#c0303b' },
        warning: { main: '#8f5200' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#8aa2ff' },
        background: { default: '#0e1424', paper: '#161d31' },
        text: { primary: '#e8ecf7', secondary: '#9aa6c1' },
        divider: '#2a3452',
        success: { main: '#5fd592' },
        error: { main: '#ff8a93' },
        warning: { main: '#f2b45a' },
      },
    },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: '1.5rem', fontWeight: 500, lineHeight: 1.25 },
    h2: { fontSize: '1rem', fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 500, letterSpacing: '.2px' } } },
    MuiPaper: { defaultProps: { variant: 'outlined' } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
  },
});

export const monoFont = mono;
