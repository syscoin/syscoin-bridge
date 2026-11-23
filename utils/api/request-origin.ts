import type { NextApiRequest } from "next";

// Callers apply the endpoint's CORS policy before using this value.
export const getRequestOrigin = (req: NextApiRequest): string | null => {
  const origin = req.headers?.origin;
  if (typeof origin !== "string") return null;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === origin ? origin : null;
  } catch {
    return null;
  }
};
