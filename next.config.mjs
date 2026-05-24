/** @type {import('next').NextConfig} */
const postHogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const postHogAssetsHost = postHogHost.includes("eu.")
  ? "https://eu-assets.i.posthog.com"
  : "https://us-assets.i.posthog.com";

const nextConfig = {
  typedRoutes: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${postHogAssetsHost}/static/:path*`
      },
      {
        source: "/ingest/array/:path*",
        destination: `${postHogAssetsHost}/array/:path*`
      },
      {
        source: "/ingest/:path*",
        destination: `${postHogHost}/:path*`
      }
    ];
  },
  skipTrailingSlashRedirect: true
};

export default nextConfig;
