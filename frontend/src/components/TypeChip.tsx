import LockOutlined from '@mui/icons-material/LockOutlined';
import Chip from '@mui/material/Chip';
import type { FeatureKind } from '../types';

const COLORS: Record<FeatureKind, { light: [string, string]; dark: [string, string] }> = {
  BOOLEAN: { light: ['#efe8fb', '#5b2fb0'], dark: ['#2b2147', '#b99aff'] },
  INTEGER: { light: ['#dff3f5', '#075e6b'], dark: ['#10303a', '#5fd0dd'] },
  STRING: { light: ['#fcecd3', '#8a4b00'], dark: ['#38280f', '#f0b361'] },
};

export const KIND_LABEL: Record<FeatureKind, string> = { BOOLEAN: 'Boolean', INTEGER: 'Integer', STRING: 'String' };

export const KIND_ACCENT: Record<FeatureKind, { light: string; dark: string }> = {
  BOOLEAN: { light: '#5b2fb0', dark: '#b99aff' },
  INTEGER: { light: '#075e6b', dark: '#5fd0dd' },
  STRING: { light: '#8a4b00', dark: '#f0b361' },
};

export default function TypeChip({ kind, locked = false }: { kind: FeatureKind; locked?: boolean }) {
  const c = COLORS[kind];
  return (
    <Chip
      size="small"
      label={KIND_LABEL[kind]}
      icon={locked ? <LockOutlined /> : undefined}
      sx={(t) => ({
        bgcolor: c.light[0],
        color: c.light[1],
        fontWeight: 500,
        '& .MuiChip-icon': { color: 'inherit', fontSize: 14 },
        ...t.applyStyles('dark', { bgcolor: c.dark[0], color: c.dark[1] }),
      })}
    />
  );
}
