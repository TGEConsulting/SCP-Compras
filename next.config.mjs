/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions ya validan Origin vs Host (protección CSRF). Se añaden dominios propios aquí.
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: process.env.APP_URL ? [new URL(process.env.APP_URL).host] : undefined,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
