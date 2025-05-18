import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // serverActions: true, // Not strictly needed for this feature, but good for future.
    // Enabling it generally for Next.js 14+ patterns.
    // For Next 15.2.3 (current version), bodySizeLimit is part of experimental for App Router.
    // It might be useful if large file uploads are routed through server actions in the future.
    // For now, our API routes will handle this directly.
  },
};

export default nextConfig;
