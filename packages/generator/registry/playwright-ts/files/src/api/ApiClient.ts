import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Thin, typed wrapper around Playwright's APIRequestContext.
 * Centralises base behaviour (headers, logging hooks) so individual
 * API tests stay focused on assertions rather than plumbing.
 */
export class ApiClient {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async get(endpoint: string, params?: Record<string, string | number>): Promise<APIResponse> {
    return this.request.get(endpoint, { params });
  }

  async post(endpoint: string, data: unknown): Promise<APIResponse> {
    return this.request.post(endpoint, { data });
  }

  async put(endpoint: string, data: unknown): Promise<APIResponse> {
    return this.request.put(endpoint, { data });
  }

  async delete(endpoint: string): Promise<APIResponse> {
    return this.request.delete(endpoint);
  }
}
