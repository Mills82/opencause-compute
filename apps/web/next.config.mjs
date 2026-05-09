/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@opencause/shared'],
  turbopack: {
    root: new URL('../..', import.meta.url).pathname
  }
};

export default nextConfig;
