import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export const STEPS = ['Upload model', 'Map features', 'Test data', 'Results'] as const;

const slice = createSlice({
  name: 'wizard',
  initialState: { step: 0 },
  reducers: {
    goTo(state, action: PayloadAction<number>) {
      state.step = action.payload;
    },
  },
});

export const { goTo } = slice.actions;
export default slice.reducer;
