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

type BuildApiUrlOptions = {
  fallbackOrigin?: string;
};

export const buildApiUrl = (
  path: string,
  options?: BuildApiUrlOptions
): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl() || options?.fallbackOrigin || "";

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};
