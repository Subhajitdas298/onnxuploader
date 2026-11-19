import { BlockBlobClient } from '@azure/storage-blob';
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../api/api';
import { goTo } from '../../app/wizardSlice';

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

interface UploadState {
  phase: UploadPhase;
  progress: number;
  fileName: string | null;
  fileSize: number;
  error: string | null;
}

const initialState: UploadState = { phase: 'idle', progress: 0, fileName: null, fileSize: 0, error: null };

export const MAX_MODEL_BYTES = 25 * 1024 * 1024;

/**
 * Drop a file, get a short-lived write-only link from the service (the user never sees it), upload straight to
 * Blob Storage, then move on to the analysis. The blob name is fixed, so every upload replaces the last model.
 */
export const uploadModel = createAsyncThunk<void, File, { rejectValue: string }>(
  'upload/uploadModel',
  async (file, { dispatch, rejectWithValue }) => {
    if (!/\.onnx$/i.test(file.name)) {
      return rejectWithValue(`“${file.name}” is not an .onnx file. Choose a file that ends in .onnx.`);
    }
    if (file.size === 0) return rejectWithValue(`“${file.name}” is empty.`);
    if (file.size > MAX_MODEL_BYTES) return rejectWithValue(`“${file.name}” is larger than 25 MB.`);

    dispatch(started({ name: file.name, size: file.size }));
    try {
      const link = await dispatch(api.endpoints.createUploadLink.initiate()).unwrap();
      dispatch(uploading());
      await new BlockBlobClient(link.url).uploadData(file, {
        blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
        onProgress: (e) => dispatch(progressed(Math.min(100, Math.round((e.loadedBytes / file.size) * 100)))),
      });
    } catch (e) {
      return rejectWithValue(errorMessage(e));
    }
    dispatch(api.util.invalidateTags(['Model']));
    dispatch(finished());
    // Show the finished upload for a moment, then go straight to the analysis.
    await new Promise((resolve) => setTimeout(resolve, 900));
    dispatch(goTo(1));
  },
);

const slice = createSlice({
  name: 'upload',
  initialState,
  reducers: {
    started(state, action: PayloadAction<{ name: string; size: number }>) {
      state.phase = 'preparing';
      state.progress = 0;
      state.fileName = action.payload.name;
      state.fileSize = action.payload.size;
      state.error = null;
    },
    uploading(state) {
      state.phase = 'uploading';
    },
    progressed(state, action: PayloadAction<number>) {
      state.progress = action.payload;
    },
    finished(state) {
      state.phase = 'done';
      state.progress = 100;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadModel.fulfilled, (state) => {
        state.phase = 'idle';
        state.progress = 0;
      })
      .addCase(uploadModel.rejected, (state, action) => {
        state.phase = 'error';
        state.error = action.payload ?? 'The upload failed.';
        if (!state.fileName) state.fileName = action.meta.arg.name;
      });
  },
});

const { started, uploading, progressed, finished } = slice.actions;
export default slice.reducer;
