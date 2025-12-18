/**
 * Authentication utilities for handling JWT tokens and automatic refresh
 */

import { API_BASE_URL } from '@/config/api';

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

/**
 * Check if a JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch (error) {
    return true; // Assume expired if we can't parse
  }
}

/**
 * Refresh the access token
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const currentToken = localStorage.getItem('auth_token');
    if (!currentToken) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If credentials are invalid (401/403), clear token and force logout
      if (response.status === 401 || response.status === 403) {
        try {
          localStorage.removeItem('auth_token');
        } catch {}
        // best-effort redirect to login/root so RequireAuth kicks in
        try {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        } catch {}
      }
      return null;
    }

    const tokenData: TokenResponse = await response.json();
    localStorage.setItem('auth_token', tokenData.access_token);
    return tokenData.access_token;
  } catch (error) {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidToken(): Promise<string | null> {
  const currentToken = localStorage.getItem('auth_token');
  
  if (!currentToken) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(currentToken)) {
    const newToken = await refreshAccessToken();
    return newToken;
  }

  return currentToken;
}

/**
 * Make an authenticated request with automatic token refresh
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  
  if (!token) {
    throw new Error('No valid authentication token available');
  }

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If we get a 401, try refreshing the token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    
    if (newToken) {
      // Retry the request with the new token
      const retryHeaders = {
        ...options.headers,
        'Authorization': `Bearer ${newToken}`,
      };
      
      return fetch(url, {
        ...options,
        headers: retryHeaders,
      });
    }
  }

  return response;
}
