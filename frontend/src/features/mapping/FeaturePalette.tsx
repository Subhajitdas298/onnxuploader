import DragIndicator from '@mui/icons-material/DragIndicator';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState, type KeyboardEvent } from 'react';
import TypeChip, { KIND_ACCENT } from '../../components/TypeChip';
import { monoFont } from '../../theme';
import type { Feature, FeatureKind } from '../../types';

interface Props {
  features: Feature[];
  /** Feature name per model input, in model order. */
  assignment: (string | null)[];
  armed: string | null;
  onArm: (name: string) => void;
  onDragStart: (name: string) => void;
  onDragEnd: () => void;
}

type Filter = 'ALL' | FeatureKind;

export default function FeaturePalette({ features, assignment, armed, onArm, onDragStart, onDragEnd }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const categories = [...new Set(features.map((f) => f.category))];
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(categories.slice(0, 2).map((c) => [c, true])));

  return (
    <Paper component="aside" aria-label="Features" sx={{ p: 2, position: { md: 'sticky' }, top: 16, maxHeight: { md: 'calc(100vh - 32px)' }, overflowY: 'auto' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h2">Features</Typography>
          <Typography variant="caption" color="text.secondary">
            {features.length} supported
          </Typography>
        </Stack>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={filter}
          onChange={(_, v: Filter | null) => v && setFilter(v)}
          aria-label="Filter by type"
        >
          <ToggleButton value="ALL">All</ToggleButton>
          <ToggleButton value="BOOLEAN">Boolean</ToggleButton>
          <ToggleButton value="INTEGER">Integer</ToggleButton>
          <ToggleButton value="STRING">String</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Drag a feature onto an input. On touch screens, tap a feature and then tap the input.
        </Typography>

        {categories.map((cat) => {
          const list = features.filter((f) => f.category === cat && (filter === 'ALL' || f.kind === filter));
          if (list.length === 0) return null;
          const used = list.filter((f) => assignment.includes(f.name)).length;
          const expanded = filter !== 'ALL' || !!open[cat];
          return (
            <Accordion
              key={cat}
              expanded={expanded}
              onChange={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
              disableGutters
              sx={{ '&::before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 500, flex: 1 }}>{cat}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1, alignSelf: 'center' }}>
                  {used ? `${used} of ${list.length} used` : list.length}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1.25 }}>
                <Stack spacing={1}>
                  {list.map((f) => (
                    <FeatureCard
                      key={f.name}
                      feature={f}
                      usedBy={assignment.indexOf(f.name)}
                      armed={armed === f.name}
                      onArm={() => onArm(f.name)}
                      onDragStart={() => onDragStart(f.name)}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Paper>
  );
}

function FeatureCard({
  feature,
  usedBy,
  armed,
  onArm,
  onDragStart,
  onDragEnd,
}: {
  feature: Feature;
  usedBy: number;
  armed: boolean;
  onArm: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const accent = KIND_ACCENT[feature.kind];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onArm();
    }
  };
  return (
    <Paper
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={armed}
      onClick={onArm}
      onKeyDown={onKey}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', feature.name);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      sx={(t) => ({
        position: 'relative',
        display: 'flex',
        gap: 1,
        p: 1.5,
        pb: 1.25,
        minHeight: 92,
        cursor: 'grab',
        borderLeft: `3px solid ${accent.light}`,
        bgcolor: usedBy >= 0 ? 'action.hover' : 'background.paper',
        outline: armed ? `2px solid ${t.palette.primary.main}` : 'none',
        '&:hover': { borderColor: 'primary.main' },
        ...t.applyStyles('dark', { borderLeft: `3px solid ${accent.dark}` }),
      })}
    >
      <DragIndicator fontSize="small" sx={{ color: 'text.secondary', mt: '1px' }} />
      <Box sx={{ flex: 1, minWidth: 0, pb: 3.25 }}>
        <Typography sx={{ fontFamily: monoFont, fontWeight: 500, fontSize: 14, overflowWrap: 'anywhere', pr: usedBy >= 0 ? 6 : 0 }}>{feature.name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.4 }}>
          {feature.description}
        </Typography>
      </Box>
      {usedBy >= 0 && <Chip size="small" label={`→ #${usedBy + 1}`} sx={{ position: 'absolute', top: 10, right: 10, height: 20, fontSize: 11 }} />}
      <Box sx={{ position: 'absolute', right: 10, bottom: 10 }}>
        <TypeChip kind={feature.kind} />
      </Box>
    </Paper>
  );
}
