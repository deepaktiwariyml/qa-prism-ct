export const COOKIE_NAME = 'qa_prism_session';

/**
 * Derive the session cookie value from the shared password. Edge- and
 * node-runtime safe (Web Crypto). The cookie stores this hash, not the
 * password; middleware recomputes it from APP_PASSWORD to validate.
 */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`qa-prism:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
