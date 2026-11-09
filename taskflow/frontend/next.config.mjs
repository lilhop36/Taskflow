import path from 'path';
import { fileURLToPath } from 'url';

// next.config.mjs runs as ESM, so derive the directory from import.meta.url.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel's Root Directory already points at this package, so /vercel/path0 *is*
// taskflow/frontend. Declaring a tracing/monorepo root one level up then makes the
// deployer resolve the app as <path0>/frontend and look for
// /vercel/path0/frontend/.next/package.json, which does not exist — the build
// succeeds and only the deploy step fails. Vercel handles monorepo tracing itself,
// so set these only for local/non-Vercel builds. (Same guard as JobHunter's config.)
const outsideVercel = process.env.VERCEL
  ? {}
  : {
      // Monorepo: dependencies are hoisted to the workspace root (taskflow/),
      // so both tracing and Turbopack need to resolve from there.
      outputFileTracingRoot: path.join(dirname, '..'),
      turbopack: { root: path.join(dirname, '..') },
    };

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...outsideVercel,
};

export default nextConfig;
