/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false };

    return config;
  },
  output: "standalone",
  images: {
    domains: ["syscoin.github.io"],
  },
  env: {
    NEXT_PUBLIC_COMMIT_HASH:
      process.env.NEXT_PUBLIC_COMMIT_HASH ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      (() => {
        try {
          return require("child_process")
            .execSync("git rev-parse HEAD")
            .toString()
            .trim();
        } catch (e) {
          return "";
        }
      })(),
    NEXT_PUBLIC_REPO_URL:
      process.env.NEXT_PUBLIC_REPO_URL ||
      process.env.REPOSITORY_URL ||
      "https://github.com/syscoin/syscoin-bridge",
  },
};

module.exports = nextConfig;

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,

    org: "tedsyscoin",
    project: "syscoin-bridge",
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  }
);
