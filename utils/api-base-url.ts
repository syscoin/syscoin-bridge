import { resolveApiProxyTarget } from "./api-proxy-target";

const stripTrailingSlashes = (value: string) => {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
};

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    return "";
  }

  return stripTrailingSlashes(process.env.NEXT_PUBLIC_API_BASE_URL || "");
};

export const API_BASE_URL = getApiBaseUrl();

const getInternalApiBaseUrl = () => {
  const baseUrl = stripTrailingSlashes(
    (process.env.INTERNAL_API_BASE_URL || resolveApiProxyTarget()).trim()
  );

  if (!baseUrl) {
    throw new Error(
      "INTERNAL_API_BASE_URL is required for server-side API requests"
    );
  }

  const protocol = new URL(baseUrl).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("INTERNAL_API_BASE_URL must use HTTP or HTTPS");
  }

  return baseUrl;
};

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};

export const buildInternalApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getInternalApiBaseUrl()}${normalizedPath}`;
};
