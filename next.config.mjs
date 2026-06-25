/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  webpack: (config) => {
    // Next/webpack file-system cache mis-parses this workspace path because the
    // parent directory contains '#'. Disable cache so the demo builds in-place.
    config.cache = false;
    return config;
  },
};

export default nextConfig;
