import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AnalysisInput, Feature } from '../../types';
import { autoMatch } from './logic';

interface MappingState {
  /** Model version the assignment belongs to. A new upload starts from a fresh auto-match. */
  forVersion: string | null;
  /** Feature name per model input, in model order. */
  assignment: (string | null)[];
}

const initialState: MappingState = { forVersion: null, assignment: [] };

const slice = createSlice({
  name: 'mapping',
  initialState,
  reducers: {
    init(state, action: PayloadAction<{ version: string; inputs: AnalysisInput[]; features: Feature[] }>) {
      if (state.forVersion === action.payload.version) return;
      state.forVersion = action.payload.version;
      state.assignment = autoMatch(action.payload.inputs, action.payload.features);
    },
    resetToAuto(state, action: PayloadAction<{ inputs: AnalysisInput[]; features: Feature[] }>) {
      state.assignment = autoMatch(action.payload.inputs, action.payload.features);
    },
    /** Puts a feature on an input. A feature used elsewhere moves, it is never used twice. */
    assign(state, action: PayloadAction<{ index: number; feature: string }>) {
      const previous = state.assignment.indexOf(action.payload.feature);
      if (previous >= 0) state.assignment[previous] = null;
      state.assignment[action.payload.index] = action.payload.feature;
    },
    unassign(state, action: PayloadAction<number>) {
      state.assignment[action.payload] = null;
    },
  },
});

export const { init, resetToAuto, assign, unassign } = slice.actions;
export default slice.reducer;
