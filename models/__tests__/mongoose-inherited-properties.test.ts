import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "child_process";

// A regression must not corrupt shared built-ins in the Jest worker.
describe("Mongoose Mixed-field inherited properties", () => {
  it("preserves normal queries after malicious construction and hydration", () => {
    const result = spawnSync(process.execPath, ["-e", `
      const mongoose = require(process.env.MONGOOSE_PATH);
      const Model = new mongoose.Mongoose().model("MixedRegression",
        new mongoose.Schema({ name: String, payload: { type: Object } }));
      (async () => {
        for (const key of ["toString", "valueOf"]) {
          new Model({ ["payload." + key + ".call"]: 1 });
          Model.hydrate({ payload: { [key]: { call: 1 } } });
        }
        Model.collection.findOne = async () => ({ name: "normal", payload: { ok: true } });
        const found = await Model.findOne({ name: "normal" }).exec();
        if (typeof Object.prototype.toString.call !== "function" ||
            typeof Object.prototype.valueOf.call !== "function" ||
            found.name !== "normal" || found.payload.ok !== true) {
          throw new Error("Mixed input corrupted later queries");
        }
        process.stdout.write("normal query passed");
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      env: { ...process.env, MONGOOSE_PATH: require.resolve("mongoose") },
      encoding: "utf8", timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("normal query passed");
  });
});

// Unknown root fields use Mongoose's init() traversal rather than Mixed assignment.
describe("Mongoose inherited-key hydration", () => {
  it.each([
    ["root", "toString"], ["root", "valueOf"],
    ["nested", "toString"], ["nested", "valueOf"],
  ])("preserves queries after hydrating %s %s", (level, key) => {
    const result = spawnSync(process.execPath, ["-e", `
      const mongoose = require(process.env.MONGOOSE_PATH);
      const Model = new mongoose.Mongoose().model("HydrationRegression",
        new mongoose.Schema({ name: String }));
      (async () => {
        const attack = { [process.env.ATTACK_KEY]: { call: 1 } };
        const loaded = Model.hydrate({ name: "stored",
          ...(process.env.ATTACK_LEVEL === "root" ? attack : { extra: attack }) });
        if (loaded.$errors) throw new Error("Hydration caused a casting error");
        if (typeof Object.prototype[process.env.ATTACK_KEY].call !== "function") {
          throw new Error("Hydration corrupted inherited state");
        }
        Model.collection.findOne = async () => ({ name: "normal" });
        const found = await Model.findOne({ name: "normal" }).exec();
        if (found.name !== "normal") throw new Error("Subsequent query failed");
        process.stdout.write("normal query passed");
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      env: { ...process.env, MONGOOSE_PATH: require.resolve("mongoose"), ATTACK_KEY: key, ATTACK_LEVEL: level },
      encoding: "utf8", timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("normal query passed");
  });
});
