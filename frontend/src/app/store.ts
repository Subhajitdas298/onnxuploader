import { configureStore } from '@reduxjs/toolkit';
import { api } from '../api/api';
import mapping from '../features/mapping/mappingSlice';
import results from '../features/results/resultsSlice';
import tests from '../features/tests/testsSlice';
import upload from '../features/upload/uploadSlice';
import wizard from './wizardSlice';

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, wizard, upload, mapping, tests, results },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
