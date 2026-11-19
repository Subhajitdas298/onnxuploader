import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import Stepper from '@mui/material/Stepper';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useGetAnalysisQuery, useGetModelInfoQuery } from './api/api';
import { useAppDispatch, useAppSelector } from './app/hooks';
import { STEPS, goTo } from './app/wizardSlice';
import MappingStep from './features/mapping/MappingStep';
import ResultsStep from './features/results/ResultsStep';
import TestDataStep from './features/tests/TestDataStep';
import UploadStep from './features/upload/UploadStep';

export default function App() {
  const dispatch = useAppDispatch();
  const step = useAppSelector((s) => s.wizard.step);
  const assignment = useAppSelector((s) => s.mapping.assignment);
  const hasResults = useAppSelector((s) => s.results.data !== null);
  const { data: info } = useGetModelInfoQuery();
  const { data: analysis } = useGetAnalysisQuery(undefined, { skip: !info?.exists });

  const mapped = !!analysis?.usable && assignment.length === analysis.inputs.length && assignment.every(Boolean);
  const reachable = [true, !!info?.exists, mapped, hasResults];

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#16224a', color: '#fff' }}>
        <Toolbar sx={{ gap: 1.5, maxWidth: 1080, width: '100%', mx: 'auto' }}>
          <GppGoodOutlined />
          <Typography variant="h6" component="span" sx={{ fontWeight: 500, fontSize: 18 }}>
            Fraud Model Runner
          </Typography>
          <Chip label="Demo" size="small" sx={{ bgcolor: 'rgba(255,255,255,.16)', color: 'inherit', textTransform: 'uppercase', fontSize: 11, fontWeight: 500 }} />
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ maxWidth: 1080, py: 3, pb: 7 }}>
        <Stepper nonLinear activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map((label, i) => (
            <Step key={label} completed={i < step}>
              <StepButton disabled={!reachable[i]} onClick={() => dispatch(goTo(i))}>
                <Box component="span" sx={{ display: { xs: i === step ? 'inline' : 'none', sm: 'inline' } }}>
                  {label}
                </Box>
              </StepButton>
            </Step>
          ))}
        </Stepper>
        {step === 0 && <UploadStep />}
        {step === 1 && <MappingStep />}
        {step === 2 && <TestDataStep />}
        {step === 3 && <ResultsStep />}
      </Container>
    </>
  );
}
