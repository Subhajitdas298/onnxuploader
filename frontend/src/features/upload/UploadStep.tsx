import ArrowForward from '@mui/icons-material/ArrowForward';
import CheckCircle from '@mui/icons-material/CheckCircle';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState, type DragEvent } from 'react';
import { useGetModelInfoQuery } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goTo } from '../../app/wizardSlice';
import { fmtBytes } from '../../components/format';
import StepHeader from '../../components/StepHeader';
import { monoFont } from '../../theme';
import { uploadModel } from './uploadSlice';

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default function UploadStep() {
  const dispatch = useAppDispatch();
  const { phase, progress, fileName, fileSize, error } = useAppSelector((s) => s.upload);
  const { data: info } = useGetModelInfoQuery();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'done';

  const pick = (file?: File | null) => {
    if (file) dispatch(uploadModel(file));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) pick(e.dataTransfer.files[0]);
  };
  const phaseText =
    phase === 'preparing' ? 'Preparing secure upload' : phase === 'uploading' ? 'Uploading to Azure Blob Storage' : 'Uploaded. Starting analysis';

  return (
    <>
      <StepHeader title="Upload your model">
        Drop an ONNX file to replace the current model. It is analyzed as soon as the upload finishes.
      </StepHeader>
      <Stack spacing={2}>
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <InsertDriveFileOutlined sx={{ fontSize: 36, color: 'text.secondary' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Current model
              </Typography>
              <Typography sx={{ fontFamily: monoFont, fontWeight: 500, fontSize: 16 }}>model.onnx</Typography>
              <Typography variant="caption" color="text.secondary">
                {info?.exists
                  ? `${fmtBytes(info.sizeBytes ?? 0)} · uploaded ${new Date(info.lastModified ?? '').toLocaleString()}`
                  : info
                    ? 'No model uploaded yet'
                    : 'Checking storage…'}
              </Typography>
            </Box>
            {info?.exists && <Chip color="success" variant="outlined" size="small" icon={<CheckCircle />} label="Stored" />}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            {phase === 'error' && (
              <Alert severity="error">
                <b>Not uploaded.</b> {error}
              </Alert>
            )}
            {busy ? (
              <>
                <Paper sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <InsertDriveFileOutlined sx={{ fontSize: 36 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{fileName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtBytes(fileSize)} · stored as <span style={{ fontFamily: monoFont }}>model.onnx</span>
                    </Typography>
                    <LinearProgress
                      variant={phase === 'preparing' ? 'indeterminate' : 'determinate'}
                      value={progress}
                      sx={{ mt: 1, height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  <Chip size="small" label={phase === 'done' ? 'Uploaded' : phase === 'uploading' ? `${progress}%` : 'Waiting'} color={phase === 'done' ? 'success' : 'default'} />
                </Paper>
                <Stack direction="row" spacing={1} role="status" color="text.secondary" sx={{ alignItems: 'center' }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">{phaseText}…</Typography>
                </Stack>
              </>
            ) : (
              <Paper
                data-testid="dropzone"
                onClick={(e) => {
                  // the button's own label already opens the chooser
                  if (!(e.target as HTMLElement).closest('label')) input.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
                sx={{
                  border: '2px dashed',
                  borderColor: over ? 'primary.main' : 'divider',
                  bgcolor: over ? 'action.hover' : 'transparent',
                  py: 4,
                  px: 2,
                  textAlign: 'center',
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                }}
              >
                {/* The whole area can be clicked or dropped on. The button is the one control for keyboard and screen reader users. */}
                <Stack spacing={1} color="text.secondary" sx={{ alignItems: 'center' }}>
                  <CloudUploadOutlined sx={{ fontSize: 40 }} />
                  <Typography sx={{ color: 'text.primary', fontWeight: 500, fontSize: 16 }}>Drag and drop your .onnx file here</Typography>
                  <Typography variant="body2">or</Typography>
                  {/* A real file input inside the button label: keyboard and screen reader users get the native control. */}
                  <Button component="label" variant="contained" role={undefined} tabIndex={-1} sx={{ '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
                    Browse files
                    <input
                      ref={input}
                      type="file"
                      accept=".onnx"
                      style={VISUALLY_HIDDEN}
                      onChange={(e) => {
                        pick(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </Button>
                  <Typography variant="caption">Single file · .onnx · up to 25 MB · replaces the current model</Typography>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Paper>

        {!busy && info?.exists && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="outlined" endIcon={<ArrowForward />} onClick={() => dispatch(goTo(1))}>
              Analyze current model
            </Button>
          </Box>
        )}
      </Stack>
    </>
  );
}
