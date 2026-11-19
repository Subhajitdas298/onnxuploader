import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { errorMessage, useGetAnalysisQuery, useGetFeaturesQuery, useRunTestsMutation } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goTo } from '../../app/wizardSlice';
import StepHeader from '../../components/StepHeader';
import TypeChip from '../../components/TypeChip';
import { monoFont } from '../../theme';
import type { CellValue, FeatureKind, TestRunRequest } from '../../types';
import { isWholeNumber, parseTestCsv } from './csv';
import { addRow, csvFailed, csvLoaded, deleteRow, setCell, triedRun, type TestRow } from './testsSlice';

interface Column {
  feature: string;
  kind: FeatureKind;
  input: number;
  inputName: string;
}

/** Is this cell acceptable? Booleans always are; the rest need a value of the right shape. */
function cellInvalid(kind: FeatureKind, value: CellValue | undefined): boolean {
  if (kind === 'BOOLEAN') return false;
  const v = typeof value === 'string' ? value.trim() : '';
  return kind === 'INTEGER' ? !isWholeNumber(v) : v === '';
}

export default function TestDataStep() {
  const dispatch = useAppDispatch();
  const { data: features } = useGetFeaturesQuery();
  const { data: analysis } = useGetAnalysisQuery();
  const assignment = useAppSelector((s) => s.mapping.assignment);
  const { rows, csv, triedRun: tried } = useAppSelector((s) => s.tests);
  const [run, { isLoading, error }] = useRunTestsMutation();
  const fileInput = useRef<HTMLInputElement>(null);

  if (!features || !analysis) return null;
  const kindOf = new Map(features.map((f) => [f.name, f.kind]));
  const columns: Column[] = analysis.inputs.map((input, i) => ({
    feature: assignment[i] ?? '',
    kind: kindOf.get(assignment[i] ?? '') ?? 'STRING',
    input: i,
    inputName: input.name,
  }));

  const invalidCount = rows.reduce((n, r) => n + columns.filter((c) => cellInvalid(c.kind, r.values[c.feature])).length, 0);

  const loadCsv = async (file: File) => {
    const result = parseTestCsv(await file.text(), columns);
    if (result.errors.length) dispatch(csvFailed({ name: file.name, errors: result.errors }));
    else dispatch(csvLoaded({ name: file.name, rows: result.rows }));
  };

  const submit = async () => {
    if (rows.length === 0 || invalidCount > 0) {
      dispatch(triedRun());
      return;
    }
    const body: TestRunRequest = {
      mapping: columns.map((c) => ({ input: c.inputName, feature: c.feature })),
      rows: rows.map((r) => ({
        values: Object.fromEntries(
          columns.map((c) => {
            const v = r.values[c.feature];
            const typed = c.kind === 'BOOLEAN' ? Boolean(v) : c.kind === 'INTEGER' ? Number(String(v).trim()) : String(v ?? '').trim();
            return [c.feature, typed];
          }),
        ),
      })),
    };
    try {
      await run(body).unwrap();
      dispatch(goTo(3));
    } catch {
      // the error is shown below
    }
  };

  const empty = rows.length === 0;
  const showInvalid = tried && invalidCount > 0;

  return (
    <>
      <StepHeader title="Test data">
        Enter feature values for each test case, or load them from a CSV file. At least one test case is required.
      </StepHeader>
      <Stack spacing={2}>
        <Paper>
          <Stack direction="row" spacing={1} sx={{ p: '14px 20px', borderBottom: 1, borderColor: 'divider' }}>
            <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => dispatch(addRow())}>
              Add row
            </Button>
            <Button size="small" variant="outlined" startIcon={<FileUploadOutlined />} onClick={() => fileInput.current?.click()}>
              Load CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void loadCsv(f);
              }}
            />
          </Stack>
          <Box sx={{ px: 2.5, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              CSV needs a header row: <span style={{ fontFamily: monoFont, color: 'inherit' }}>{columns.map((c) => c.feature).join(',')}</span>. Values are
              true or false, whole numbers or text. Column order does not matter. Loading a file replaces the rows below.
            </Typography>
          </Box>
          {csv && (
            <Box sx={{ p: '12px 20px', borderBottom: 1, borderColor: 'divider' }}>
              {csv.errors ? (
                <Alert severity="error">
                  <b>Could not load {csv.name}</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {csv.errors.slice(0, 5).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {csv.errors.length > 5 && <li>and {csv.errors.length - 5} more</li>}
                  </ul>
                </Alert>
              ) : (
                <Alert severity="success">
                  <b>
                    Loaded {csv.count} test case{csv.count === 1 ? '' : 's'} from {csv.name}
                  </b>{' '}
                  The grid below now shows these rows. You can still edit them.
                </Alert>
              )}
            </Box>
          )}
          <TableContainer>
            <Table size="small" sx={{ '& td, & th': { py: 1 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover', verticalAlign: 'bottom' }}>
                  <TableCell sx={{ width: 44 }}>#</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.feature}>
                      <Typography sx={{ fontFamily: monoFont, fontSize: 13, fontWeight: 500, color: 'text.primary' }}>{c.feature}</Typography>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center',  mt: 0.5 }}>
                        <TypeChip kind={c.kind} />
                        <Typography variant="caption" color="text.secondary">
                          input #{c.input + 1}
                        </Typography>
                      </Stack>
                    </TableCell>
                  ))}
                  <TableCell sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {empty ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 2} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No test cases yet. Add a row or load a CSV file.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, i) => (
                    <GridRow key={row.id} row={row} index={i} columns={columns} tried={tried} />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {error && <Alert severity="error">{errorMessage(error)}</Alert>}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBack />} onClick={() => dispatch(goTo(1))}>
            Back
          </Button>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Stack direction="row" spacing={0.75} role="status" sx={{ alignItems: 'center',  color: empty || showInvalid ? 'error.main' : 'text.secondary' }}>
              {(empty || showInvalid) && <ErrorOutlined fontSize="small" />}
              <Typography variant="body2">
                {empty
                  ? 'Add at least one test case'
                  : showInvalid
                    ? `${invalidCount} ${invalidCount === 1 ? 'cell needs' : 'cells need'} a value`
                    : `${rows.length} test case${rows.length === 1 ? '' : 's'}`}
              </Typography>
            </Stack>
            <Button
              variant="contained"
              disabled={empty || isLoading}
              startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={() => void submit()}
            >
              Run tests
            </Button>
          </Stack>
        </Box>
      </Stack>
    </>
  );
}

function GridRow({ row, index, columns, tried }: { row: TestRow; index: number; columns: Column[]; tried: boolean }) {
  const dispatch = useAppDispatch();
  return (
    <TableRow hover>
      <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
      {columns.map((c) => {
        const value = row.values[c.feature];
        const label = `${c.feature}, row ${index + 1}`;
        if (c.kind === 'BOOLEAN') {
          const on = value === true;
          return (
            <TableCell key={c.feature}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Switch checked={on} onChange={(e) => dispatch(setCell({ id: row.id, feature: c.feature, value: e.target.checked }))} slotProps={{ input: { 'aria-label': label } }} />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 26 }}>
                  {on ? 'Yes' : 'No'}
                </Typography>
              </Stack>
            </TableCell>
          );
        }
        const text = typeof value === 'string' ? value : '';
        const bad = cellInvalid(c.kind, value) && (tried || text !== '');
        return (
          <TableCell key={c.feature}>
            <TextField
              size="small"
              fullWidth
              value={text}
              error={bad}
              placeholder={c.kind === 'INTEGER' ? '0' : 'text'}
              onChange={(e) => dispatch(setCell({ id: row.id, feature: c.feature, value: e.target.value }))}
              slotProps={{
                htmlInput: {
                  'aria-label': label,
                  inputMode: c.kind === 'INTEGER' ? 'numeric' : 'text',
                  style: { textAlign: c.kind === 'INTEGER' ? 'right' : 'left', fontFamily: c.kind === 'STRING' ? monoFont : undefined, minWidth: 90 },
                },
              }}
            />
          </TableCell>
        );
      })}
      <TableCell>
        <IconButton aria-label={`Delete row ${index + 1}`} onClick={() => dispatch(deleteRow(row.id))}>
          <DeleteOutlined />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
