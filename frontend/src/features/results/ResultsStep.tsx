import ArrowBack from '@mui/icons-material/ArrowBack';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useGetFeaturesQuery } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goTo } from '../../app/wizardSlice';
import { signed } from '../../components/format';
import StepHeader from '../../components/StepHeader';
import { monoFont } from '../../theme';
import type { Contribution, TestCaseResult } from '../../types';

function shown(v: Contribution['value']): string {
  return typeof v === 'string' ? v : String(v);
}

export default function ResultsStep() {
  const dispatch = useAppDispatch();
  const data = useAppSelector((s) => s.results.data);
  const assignment = useAppSelector((s) => s.mapping.assignment);
  useGetFeaturesQuery();

  const head = (
    <StepHeader title="Risk scores">
      The model scored each test case. Higher scores mean higher fraud risk. Under each score, the features are sorted by how much they contributed.
    </StepHeader>
  );

  if (!data) {
    return (
      <>
        {head}
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => dispatch(goTo(2))}>Go to test data</Button>}>
          <b>No scores yet.</b> Run the model from the test data screen.
        </Alert>
      </>
    );
  }

  return (
    <>
      {head}
      <Stack spacing={2}>
        <Alert severity="info">
          <b>
            {data.results.length} test case{data.results.length === 1 ? '' : 's'} scored
          </b>{' '}
          Output <span style={{ fontFamily: monoFont }}>{data.output}</span> · ran in {data.elapsedMs} ms
        </Alert>
        {data.results.map((r, i) => (
          <ResultCard key={i} index={i} result={r} order={assignment} baseline={data.baselineScore} />
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBack />} onClick={() => dispatch(goTo(2))}>
            Edit test data
          </Button>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<PlayArrow />} onClick={() => dispatch(goTo(2))}>
              Run again
            </Button>
            <Button variant="outlined" onClick={() => dispatch(goTo(0))}>
              Upload a new model
            </Button>
          </Stack>
        </Box>
      </Stack>
    </>
  );
}

function ResultCard({ index, result, order, baseline }: { index: number; result: TestCaseResult; order: (string | null)[]; baseline: number }) {
  const max = Math.max(0.01, ...result.contributions.map((c) => Math.abs(c.contribution)));
  const inputs = order.map((f) => result.contributions.find((c) => c.feature === f)).filter((c): c is Contribution => !!c);

  return (
    <Paper sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '240px minmax(0,1fr)' }, overflow: 'hidden' }}>
      <Box sx={{ p: 2.5, bgcolor: 'action.hover', borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">
          Test {index + 1}
        </Typography>
        <Typography aria-label={`Risk score ${result.score.toFixed(2)}`} sx={{ fontSize: 44, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.5px', fontVariantNumeric: 'tabular-nums' }}>
          {result.score.toFixed(2)}
        </Typography>
        <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, result.score * 100))} sx={{ my: 1, height: 6, borderRadius: 3 }} />
        <Typography variant="caption" color="text.secondary">
          Risk score, 0 to 1
        </Typography>
        <Stack spacing={0.75} sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          {inputs.map((c) => (
            <Box key={c.feature} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 12.5, fontFamily: monoFont }}>
              <Box sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{c.feature}</Box>
              <Box sx={{ fontWeight: 500 }}>{shown(c.value)}</Box>
            </Box>
          ))}
        </Stack>
      </Box>
      <Box sx={{ p: 2.5, minWidth: 0 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Typography variant="h2" sx={{ fontSize: 15 }}>
              What drove this score
            </Typography>
            <Stack direction="row" spacing={2}>
              <Legend color="error.main" label="Raises risk" />
              <Legend color="success.main" label="Lowers risk" />
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Sorted by impact. Each bar shows how far that feature moved the score from a typical transaction, which scores {baseline.toFixed(2)}.
          </Typography>
          {result.contributions.map((c, i) => (
            <Box
              key={c.feature}
              sx={{ display: 'grid', gridTemplateColumns: { xs: '24px minmax(0,1fr) 56px', sm: '24px minmax(120px,200px) minmax(0,1fr) 56px' }, gap: 1.5, alignItems: 'center' }}
            >
              <Box sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 500, bgcolor: 'action.hover', color: 'text.secondary' }}>{i + 1}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: monoFont, fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{c.feature}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: monoFont }}>
                  = {shown(c.value)}
                </Typography>
              </Box>
              <Box sx={{ position: 'relative', height: 14, borderRadius: '3px', bgcolor: 'divider', gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 3, sm: 0 } }} aria-hidden="true">
                <Box sx={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: '1px', bgcolor: 'text.secondary' }} />
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    borderRadius: '3px',
                    width: `${(Math.abs(c.contribution) / max) * 50}%`,
                    ...(c.contribution >= 0 ? { left: '50%', bgcolor: 'error.main' } : { right: '50%', bgcolor: 'success.main' }),
                  }}
                />
              </Box>
              <Typography sx={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: Math.abs(c.contribution) < 0.005 ? 'text.primary' : c.contribution > 0 ? 'error.main' : 'success.main' }}>
                {signed(c.contribution)}
              </Typography>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            Typical transaction {baseline.toFixed(2)} {result.contributions.map((c) => signed(c.contribution)).join(' ')} ={' '}
            <b style={{ color: 'inherit' }}>{result.score.toFixed(2)}</b>
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
