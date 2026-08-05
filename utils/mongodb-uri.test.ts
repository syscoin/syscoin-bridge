import { describe, expect, it } from "@jest/globals";
import { resolveMongoUri } from "./mongodb-uri";

describe("MongoDB URI resolution", () => {
  it("uses an explicit MongoDB URI when configured", () => {
    expect(
      resolveMongoUri({
        MONGODB_URI: "mongodb://configured.example/bridge",
        MONGO_ROOT_USER: "ignored",
        MONGO_ROOT_PASSWORD: "ignored",
      })
    ).toBe("mongodb://configured.example/bridge");
  });

  it("derives a Docker-network URI from existing root credentials", () => {
    expect(
      resolveMongoUri({
        MONGO_ROOT_USER: "bridge user",
        MONGO_ROOT_PASSWORD: "p@ss:/word",
        MONGO_APP_DB: "test bridge",
      })
    ).toBe(
      "mongodb://bridge%20user:p%40ss%3A%2Fword@db:27017/test%20bridge?authSource=admin"
    );
  });

  it("fails clearly when neither configuration form is complete", () => {
    expect(() =>
      resolveMongoUri({ MONGO_ROOT_USER: "user" })
    ).toThrow("MongoDB is not configured");
  });
});
