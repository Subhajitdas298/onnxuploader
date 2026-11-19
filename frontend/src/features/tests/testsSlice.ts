import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CellValue } from '../../types';
import { uploadModel } from '../upload/uploadSlice';

export interface TestRow {
  id: number;
  values: Record<string, CellValue>;
}

export interface CsvStatus {
  name: string;
  count?: number;
  errors?: string[];
}

interface TestsState {
  rows: TestRow[];
  nextId: number;
  csv: CsvStatus | null;
  triedRun: boolean;
}

const initialState: TestsState = { rows: [{ id: 1, values: {} }], nextId: 2, csv: null, triedRun: false };

const slice = createSlice({
  name: 'tests',
  initialState,
  reducers: {
    addRow(state) {
      state.rows.push({ id: state.nextId++, values: {} });
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
    csvLoaded(state, action: PayloadAction<{ name: string; rows: Record<string, CellValue>[] }>) {
      state.rows = action.payload.rows.map((values) => ({ id: state.nextId++, values }));
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

export const { addRow, deleteRow, setCell, csvLoaded, csvFailed, triedRun } = slice.actions;
export default slice.reducer;
