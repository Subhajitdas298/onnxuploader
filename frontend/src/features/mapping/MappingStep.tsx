import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { errorMessage, useGetAnalysisQuery, useGetFeaturesQuery } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goTo } from '../../app/wizardSlice';
import StepHeader from '../../components/StepHeader';
import { monoFont } from '../../theme';
import type { Analysis } from '../../types';
import FeaturePalette from './FeaturePalette';
import InputCard from './InputCard';
import { incompatibility } from './logic';
import { assign, init, resetToAuto, unassign } from './mappingSlice';

export default function MappingStep() {
  const dispatch = useAppDispatch();
  const { data: features } = useGetFeaturesQuery();
  const { data: analysis, isFetching, error } = useGetAnalysisQuery();
  const assignment = useAppSelector((s) => s.mapping.assignment);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (analysis && features && !isFetching) {
      dispatch(init({ version: analysis.version, inputs: analysis.inputs, features }));
    }
  }, [analysis, features, isFetching, dispatch]);

  const head = (
    <StepHeader title="Map model inputs to features">
      Drag features from the left onto the model inputs on the right. Inputs are listed in the order the model expects them.
    </StepHeader>
  );

  if (error) {
    return (
      <>
        {head}
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(goTo(0))}>Upload a model</Button>}>
          {errorMessage(error)}
        </Alert>
      </>
    );
  }
  if (!analysis || !features || isFetching) {
    return (
      <>
        {head}
        <Stack spacing={1.5} aria-busy="true">
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={140} />
        </Stack>
      </>
    );
  }
  if (!analysis.valid) {
    return (
      <>
        {head}
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(goTo(0))}>Upload a different file</Button>}>
          <b>This file is not a valid ONNX model.</b> {analysis.error}
        </Alert>
      </>
    );
  }

  const byName = new Map(features.map((f) => [f.name, f]));
  const mappedCount = analysis.inputs.filter((_, i) => assignment[i]).length;
  const total = analysis.inputs.length;
  const complete = mappedCount === total && analysis.usable;
  const armedFeature = armed ? byName.get(armed) ?? null : null;
  const draggingFeature = dragging ? byName.get(dragging) ?? null : null;

  const place = (index: number, name: string) => {
    const feature = byName.get(name);
    if (!feature) return;
    const problem = incompatibility(analysis.inputs[index], feature);
    if (problem) {
      setToast(problem);
      return;
    }
    dispatch(assign({ index, feature: name }));
    setArmed(null);
    setDragging(null);
  };

  return (
    <>
      {head}
      <Stack spacing={2}>
        <ModelSummary analysis={analysis} />
        {analysis.problems.length > 0 && (
          <Alert severity="warning">
            {analysis.problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0,1fr)' }, gap: 2.5, alignItems: 'start' }}>
          <FeaturePalette
            features={features}
            assignment={assignment}
            armed={armed}
            onArm={(n) => setArmed((a) => (a === n ? null : n))}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
          />
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h2" sx={{ flex: 1 }}>
                Model inputs
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mappedCount} of {total} mapped
              </Typography>
              <Button size="small" onClick={() => dispatch(resetToAuto({ inputs: analysis.inputs, features }))}>
                Reset to auto-match
              </Button>
            </Stack>
            {analysis.inputs.map((input, i) => (
              <InputCard
                key={input.name}
                input={input}
                feature={(assignment[i] && byName.get(assignment[i]!)) || null}
                dragKind={draggingFeature?.kind ?? null}
                armed={!!armedFeature}
                onDropFeature={(name) => place(i, name)}
                onPlaceArmed={() => armed && place(i, armed)}
                onClear={() => dispatch(unassign(i))}
              />
            ))}
          </Stack>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBack />} onClick={() => dispatch(goTo(0))}>
            Back
          </Button>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center',  color: complete ? 'success.main' : 'error.main' }}>
              {complete ? <CheckCircle fontSize="small" /> : <ErrorOutlined fontSize="small" />}
              <Typography variant="body2">{complete ? 'All inputs mapped' : `${total - mappedCount} input${total - mappedCount === 1 ? ' needs' : 's need'} a feature`}</Typography>
            </Stack>
            <Button variant="contained" endIcon={<ArrowForward />} disabled={!complete} onClick={() => dispatch(goTo(2))}>
              Continue to test data
            </Button>
          </Stack>
        </Box>
      </Stack>
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} message={toast} />
    </>
  );
}

function ModelSummary({ analysis }: { analysis: Analysis }) {
  const h = analysis.header;
  const score = analysis.outputs.find((o) => o.score);
  const defaultOpset = h?.opsets.find((o) => o.domain === '' || o.domain === 'ai.onnx')?.version;
  const items: [string, string][] = [
    ['Graph name', h?.graphName || 'unnamed'],
    ['IR version · opset', `${h?.irVersion ?? '?'} · ${defaultOpset ?? '?'}`],
    ['Producer', h?.producer ? `${h.producer}${h.producerVersion ? ' ' + h.producerVersion : ''}` : 'unknown'],
    ['Inputs', String(analysis.inputs.length)],
    ['Output', score ? `${score.name} · ${score.tensorType} · [${score.shape.join(', ')}]` : 'none usable'],
  ];
  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center',  mb: 2 }}>
        <CheckCircle color="success" />
        <Typography variant="h2" sx={{ flex: 1 }}>
          Valid ONNX model
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Read from <span style={{ fontFamily: monoFont }}>model.onnx</span>
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px 20px' }}>
        {items.map(([k, v]) => (
          <Box key={k}>
            <Typography variant="caption" color="text.secondary" component="div">
              {k}
            </Typography>
            <Typography sx={{ fontWeight: 500, fontFamily: k === 'Graph name' || k === 'Output' ? monoFont : undefined, overflowWrap: 'anywhere' }}>{v}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

