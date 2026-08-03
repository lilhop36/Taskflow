import path from 'path';
import { fileURLToPath } from 'url';

// next.config.mjs runs as ESM, so derive the directory from import.meta.url.
const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: dependencies are hoisted to the workspace root (taskflow/),
  // so both tracing and Turbopack need to resolve from there.
  outputFileTracingRoot: path.join(dirname, '..'),
  turbopack: {
    root: path.join(dirname, '..'),
  },
};

export default nextConfig;
