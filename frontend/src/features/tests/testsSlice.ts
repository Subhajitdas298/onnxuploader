import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CellValue } from '../../types';
import { uploadModel } from '../upload/uploadSlice';

export interface TestRow {
  id: number;
  values: Record<string, CellValue>;
  /** The score the model is expected to give, as typed. */
  expected: string;
}

export interface CsvStatus {
  name: string;
  count?: number;
  errors?: string[];
}

export const DEFAULT_TOLERANCE = '0.05';

interface TestsState {
  rows: TestRow[];
  /** How far a score may be from the expected score and still pass, as typed. */
  tolerance: string;
  nextId: number;
  csv: CsvStatus | null;
  triedRun: boolean;
}

const initialState: TestsState = { rows: [{ id: 1, values: {}, expected: '' }], tolerance: DEFAULT_TOLERANCE, nextId: 2, csv: null, triedRun: false };

const slice = createSlice({
  name: 'tests',
  initialState,
  reducers: {
    addRow(state) {
      state.rows.push({ id: state.nextId++, values: {}, expected: '' });
      state.csv = null;
    },
    deleteRow(state, action: PayloadAction<number>) {
      state.rows = state.rows.filter((r) => r.id !== action.payload);
      state.csv = null;
    },
    setCell(state, action: PayloadAction<{ id: number; feature: string; value: CellValue }>) {
      const row = state.rows.find((r) => r.id === action.payload.id);
      if (row) row.values[action.payload.feature] = action.payload.value;
    },
    setExpected(state, action: PayloadAction<{ id: number; value: string }>) {
      const row = state.rows.find((r) => r.id === action.payload.id);
      if (row) row.expected = action.payload.value;
    },
    setTolerance(state, action: PayloadAction<string>) {
      state.tolerance = action.payload;
    },
    csvLoaded(state, action: PayloadAction<{ name: string; rows: { values: Record<string, CellValue>; expected: string }[] }>) {
      state.rows = action.payload.rows.map((r) => ({ id: state.nextId++, values: r.values, expected: r.expected }));
      state.csv = { name: action.payload.name, count: action.payload.rows.length };
      state.triedRun = false;
    },
    csvFailed(state, action: PayloadAction<{ name: string; errors: string[] }>) {
      state.csv = { name: action.payload.name, errors: action.payload.errors };
    },
    triedRun(state) {
      state.triedRun = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(uploadModel.fulfilled, () => initialState);
  },
});

export const { addRow, deleteRow, setCell, setExpected, setTolerance, csvLoaded, csvFailed, triedRun } = slice.actions;
export default slice.reducer;
