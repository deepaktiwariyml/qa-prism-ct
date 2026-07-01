/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @qa-prism/core ships ESM with .js-suffixed relative imports; let Next transpile it.
  transpilePackages: ['@qa-prism/core'],
  // Root eslint (typescript-eslint) covers this app; skip Next's own lint step.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
