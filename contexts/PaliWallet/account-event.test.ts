import { getNevmAccountUpdateFromEvent } from "./account-event";

const EVM_ACCOUNT = "0x942db9399f51805f9a84664587210b7ce67e052e";

describe("getNevmAccountUpdateFromEvent", () => {
  it("uses the EVM address carried by accountsChanged", () => {
    expect(getNevmAccountUpdateFromEvent([EVM_ACCOUNT], true)).toBe(
      EVM_ACCOUNT
    );
  });

  it("accepts an EVM address during a mode transition", () => {
    expect(getNevmAccountUpdateFromEvent(EVM_ACCOUNT, false)).toBe(
      EVM_ACCOUNT
    );
  });

  it("ignores UTXO account payloads", () => {
    expect(
      getNevmAccountUpdateFromEvent(
        ["tsys1quracwgy4t3fwlf3ugs25tgkc9qmtf95cmqqt96"],
        false
      )
    ).toBeUndefined();
  });

  it("clears a disconnected EVM account", () => {
    expect(getNevmAccountUpdateFromEvent([], true)).toBeNull();
  });

  it("does not treat an empty UTXO event as an EVM disconnect", () => {
    expect(getNevmAccountUpdateFromEvent([], false)).toBeUndefined();
  });
});
