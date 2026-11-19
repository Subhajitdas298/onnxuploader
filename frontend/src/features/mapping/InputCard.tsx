import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type KeyboardEvent } from 'react';
import TypeChip from '../../components/TypeChip';
import { monoFont } from '../../theme';
import type { AnalysisInput, Feature, FeatureKind } from '../../types';
import { normalize, withArticle } from './logic';

interface Props {
  input: AnalysisInput;
  feature: Feature | null;
  /** Kind of the feature being dragged right now, to highlight the inputs that can take it. */
  dragKind: FeatureKind | null;
  /** A feature picked with a tap/click, waiting to be placed. */
  armed: boolean;
  onDropFeature: (name: string) => void;
  onPlaceArmed: () => void;
  onClear: () => void;
  /** Does any feature of this input's type have a name that matches the input? */
  hasNameMatch: boolean;
}

export default function InputCard({ input, feature, dragKind, armed, onDropFeature, onPlaceArmed, onClear, hasNameMatch }: Props) {
  const [over, setOver] = useState(false);
  const accepts = dragKind !== null && dragKind === input.kind;
  const rejects = dragKind !== null && dragKind !== input.kind;
  const missing = !feature;
  const matchedByName = feature && normalize(feature.name) === normalize(input.name);
  const onKey = (e: KeyboardEvent) => {
    if (armed && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onPlaceArmed();
    }
  };

  return (
    <Paper
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '36px minmax(0,1fr)', sm: '44px minmax(0,1fr) minmax(0,300px)' },
        gap: 2,
        alignItems: 'start',
        p: '16px 20px',
        borderColor: missing && input.supported ? 'error.main' : 'divider',
      }}
    >
      <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.secondary', fontSize: 13, fontWeight: 500 }} title="Input order is fixed">
        #{input.index + 1}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontFamily: monoFont, fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{input.name}</Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap',  mt: 1 }}>
          {input.kind ? <TypeChip kind={input.kind} locked /> : <Chip size="small" color="error" label="Not supported" />}
          <Chip size="small" variant="outlined" label={`tensor(${input.tensorType})`} sx={{ fontFamily: monoFont }} />
          <Chip size="small" variant="outlined" label={`shape [${input.shape.join(', ')}]`} sx={{ fontFamily: monoFont }} />
        </Stack>
        {input.problem && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {input.problem}
          </Typography>
        )}
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
        <Box
          role={armed ? 'button' : undefined}
          tabIndex={armed ? 0 : undefined}
          data-testid={`slot-${input.index}`}
          onClick={() => armed && onPlaceArmed()}
          onKeyDown={onKey}
          onDragOver={(e) => {
            if (accepts) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (accepts) onDropFeature(e.dataTransfer.getData('text/plain'));
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 68,
            p: '12px 14px',
            borderRadius: 2,
            border: '2px',
            borderStyle: feature && !over ? 'solid' : 'dashed',
            borderColor: over || accepts || armed ? 'primary.main' : missing && input.supported ? 'error.main' : 'divider',
            bgcolor: over || accepts ? 'action.selected' : feature ? 'action.hover' : 'transparent',
            opacity: rejects ? 0.4 : 1,
            cursor: armed ? 'pointer' : 'default',
            transition: 'background-color .12s, border-color .12s',
          }}
        >
          {feature ? (
            <>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontFamily: monoFont, fontWeight: 500, overflowWrap: 'anywhere' }}>{feature.name}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {feature.description}
                </Typography>
                {matchedByName && (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center',  mt: 0.5, color: 'success.main' }}>
                    <CheckCircle sx={{ fontSize: 14 }} />
                    <Typography variant="caption">Name matches the model input</Typography>
                  </Stack>
                )}
              </Box>
              <IconButton size="small" aria-label={`Remove ${feature.name} from input ${input.index + 1}`} onClick={(e) => { e.stopPropagation(); onClear(); }}>
                <Close fontSize="small" />
              </IconButton>
            </>
          ) : (
            <Box>
              <Typography sx={{ fontWeight: 500 }}>{input.supported ? `Drop ${withArticle(input.kind ?? 'supported')} feature here` : 'No feature can feed this input'}</Typography>
              {input.supported && (
                <Typography variant="caption" color="error">
                  {hasNameMatch ? 'Required.' : `Required. No feature name matches “${input.name}”.`}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
