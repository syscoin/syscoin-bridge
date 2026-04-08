const normalizedBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(
  /\/$/,
  ""
);

export const API_BASE_URL = normalizedBaseUrl;

type BuildApiUrlOptions = {
  fallbackOrigin?: string;
};

export const buildApiUrl = (
  path: string,
  options?: BuildApiUrlOptions
): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = API_BASE_URL || options?.fallbackOrigin || "";

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};
