import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Analysis, Feature, ModelInfo, TestRunRequest, TestRunResponse, UploadLink } from '../types';

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: `${baseUrl}/api` }),
  tagTypes: ['Model'],
  endpoints: (build) => ({
    getFeatures: build.query<Feature[], void>({ query: () => '/features' }),
    getModelInfo: build.query<ModelInfo, void>({ query: () => '/model', providesTags: ['Model'] }),
    createUploadLink: build.mutation<UploadLink, void>({ query: () => ({ url: '/upload-link', method: 'POST' }) }),
    getAnalysis: build.query<Analysis, void>({ query: () => '/model/analysis', providesTags: ['Model'] }),
    runTests: build.mutation<TestRunResponse, TestRunRequest>({
      query: (body) => ({ url: '/model/test-run', method: 'POST', body }),
    }),
  }),
});

export const {
  useGetFeaturesQuery,
  useGetModelInfoQuery,
  useCreateUploadLinkMutation,
  useGetAnalysisQuery,
  useRunTestsMutation,
} = api;

/** A readable message for any RTK Query / fetch error. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { data?: { detail?: string }; error?: string; status?: unknown; originalStatus?: number; message?: string };
    if (e.data?.detail) return e.data.detail;
    if (e.status === 'PARSING_ERROR') return `The service sent an unexpected response${e.originalStatus ? ` (${e.originalStatus})` : ''}.`;
    if (e.status === 'FETCH_ERROR') return 'The service did not respond. If it was idle, give it a few seconds to wake up and try again.';
    if (e.error) return e.error;
    if (e.message) return e.message;
  }
  return 'Something went wrong.';
}
