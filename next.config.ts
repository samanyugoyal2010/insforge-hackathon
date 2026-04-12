import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        pathname: "/v1/create-qr-code/**",
      },
    ],
  },
  // For API routes that need longer execution time
  async headers() {
    return [
      {
        source: "/api/circuitron/:path*",
        headers: [
          {
            key: "X-Timeout",
            value: "900000", // 15 minutes in milliseconds
          },
        ],
      },
    ];
  },
};

export default nextConfig;
