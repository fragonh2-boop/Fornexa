import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        has: [
          { type: "query", key: "error", value: "access_denied" },
          { type: "query", key: "error_code", value: "otp_expired" },
        ],
        destination: "/login?error=expired_link",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "query", key: "error" }],
        destination: "/login?error=invalid_link",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
