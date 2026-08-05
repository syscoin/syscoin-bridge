const LEGACY_MAINNET_BLOCKBOOK_URL = "https://blockbook.syscoin.org";

export const MAINNET_BLOCKBOOK_URL = "https://explorer-blockbook.syscoin.org";

export const resolveUtxoBlockbookUrl = (url?: string) => {
  if (url === LEGACY_MAINNET_BLOCKBOOK_URL) {
    return MAINNET_BLOCKBOOK_URL;
  }

  return url;
};

export const firstConfiguredUtxoBlockbookUrl = (
  ...urls: Array<string | undefined>
) => {
  for (const url of urls) {
    const resolvedUrl = resolveUtxoBlockbookUrl(url);
    if (resolvedUrl) {
      return resolvedUrl;
    }
  }

  return undefined;
};
