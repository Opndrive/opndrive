import axios, { AxiosHeaders } from 'axios';
import { supabase } from './supabase';

// Create an Axios instance with default config
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true, // Important for handling cookies/sessions
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  async (config) => {
    // Check if the request needs multipart/form-data
    if (config.data instanceof FormData && config.headers) {
      (config.headers as AxiosHeaders).set('Content-Type', 'multipart/form-data');
    }

    // Retrieve the token from localStorage
    const user_session = await supabase.auth.getSession();
    const userTokenString = user_session.data.session?.access_token;

    if (userTokenString) {
      (config.headers as AxiosHeaders).set('Authorization', `Bearer ${userTokenString}`);
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);
// API service functions
export const api = {
  create_staff: (email: string, password: string) =>
    apiClient.post('/admin/create/new-staff', { email, password }),
  archive_staff: (id: string) => apiClient.post('/admin/invalidate/staff', { id }),
};
