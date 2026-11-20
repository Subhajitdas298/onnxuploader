import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export default function StepHeader({
  title,
  children,
  action,
  below,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** Shown directly under the paragraph. */
  below?: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
      <Box>
        <Typography variant="h1" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: '62ch' }}>
          {children}
        </Typography>
        {below && <Box sx={{ mt: 1.5 }}>{below}</Box>}
      </Box>
      {action}
    </Box>
  );
}
