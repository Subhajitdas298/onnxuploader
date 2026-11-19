import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export default function StepHeader({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
      <Box>
        <Typography variant="h1" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: '62ch' }}>
          {children}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}
