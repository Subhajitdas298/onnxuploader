import { createSlice } from '@reduxjs/toolkit';
import { api } from '../../api/api';
import type { TestRunResponse } from '../../types';
import { assign, resetToAuto, unassign } from '../mapping/mappingSlice';
import { uploadModel } from '../upload/uploadSlice';

const slice = createSlice({
  name: 'results',
  initialState: { data: null as TestRunResponse | null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addMatcher(api.endpoints.runTests.matchFulfilled, (state, action) => {
        state.data = action.payload;
      })
      // Scores are only valid for the model and mapping they were produced with.
      .addMatcher(
        (action) => [assign.type, unassign.type, resetToAuto.type, uploadModel.fulfilled.type].includes(action.type),
        (state) => {
          state.data = null;
        },
      );
  },
});

export default slice.reducer;
