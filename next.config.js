/** @type {import('next').NextConfig} */
const { resolveApiProxyTarget } = require("./utils/api-proxy-target");

const API_PROXY_TARGET = resolveApiProxyTarget();

const HOST_API_PROXY_TARGETS = [
  {
    host: "bridge.tanenbaum.io",
    target: "https://bridge-api.tanenbaum.io",
  },
  {
    host: "bridge.syscoin.org",
    target: "https://bridge-api.syscoin.org",
  },
];

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false };
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      web3: require.resolve("web3/lib/index.js"),
    };

    return config;
  },
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "syscoin.github.io" }],
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
  async rewrites() {
    const beforeFiles = API_PROXY_TARGET
      ? [
          {
            source: "/api/:path*",
            destination: `${API_PROXY_TARGET}/api/:path*`,
          },
        ]
      : HOST_API_PROXY_TARGETS.map(({ host, target }) => ({
          source: "/api/:path*",
          has: [{ type: "host", value: host }],
          destination: `${target}/api/:path*`,
        }));

    return {
      beforeFiles,
    };
  },
};

module.exports = nextConfig;

const sentryBuildConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
);

if (sentryBuildConfigured) {
  const { withSentryConfig } = require("@sentry/nextjs/config");

  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    webpack: { treeshake: { removeDebugLogging: true } },
  });
}
