/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @qa-prism/core ships ESM with .js-suffixed relative imports; let Next transpile it.
  transpilePackages: ['@qa-prism/core'],
  // Root eslint (typescript-eslint) covers this app; skip Next's own lint step.
  eslint: { ignoreDuringBuilds: true },
  // The desktop app bundles a self-contained Next server; opt in via env so the
  // hosted/Docker build is unaffected.
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

export default nextConfig;
