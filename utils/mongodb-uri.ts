type MongoEnvironment = {
  MONGODB_URI?: string;
  MONGO_ROOT_USER?: string;
  MONGO_ROOT_PASSWORD?: string;
  MONGO_APP_DB?: string;
  [key: string]: string | undefined;
};

export const resolveMongoUri = (
  environment: MongoEnvironment = process.env
): string => {
  const configuredUri = environment.MONGODB_URI?.trim();
  if (configuredUri) {
    return configuredUri;
  }

  const username = environment.MONGO_ROOT_USER?.trim();
  const password = environment.MONGO_ROOT_PASSWORD;
  const database = environment.MONGO_APP_DB?.trim() || "bridge";
  if (!username || !password) {
    throw new Error(
      "MongoDB is not configured: set MONGODB_URI or the Mongo root credentials"
    );
  }

  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
    password
  )}@db:27017/${encodeURIComponent(database)}?authSource=admin`;
};
