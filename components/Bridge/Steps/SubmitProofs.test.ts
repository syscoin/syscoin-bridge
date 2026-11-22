import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { ProofSponsorshipUnavailableError } from "utils/proof-submission";
import ts from "typescript";

const submitSponsored = jest.fn();
const submitFromWallet = jest.fn();
let sponsorshipError: Error | undefined;
const proof = { nevm_blockhash: "nevm-block", blockhash: "utxo-block" };
const transfer = {
  id: "saved-transfer",
  logs: [{ status: "generate-proofs", payload: { data: proof } }],
};

// Compile only the component's JSX for the Jest node environment.
const source = readFileSync(join(__dirname, "SubmitProofs.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const componentExports: Record<string, any> = {};
new Function("require", "exports", compiled + "\nexports.TestSubmitProofs = SubmitProofs;")(
  (name: string) => {
    if (name === "../context/TransferContext") {
      return { useTransfer: () => ({ transfer, saveTransfer: jest.fn() }) };
    }
    if (name === "../hooks/useSubmitProof") {
      return {
        isSpvProof: (value: unknown) => value === proof,
        useSubmitProof: () => ({ mutate: submitFromWallet }),
      };
    }
    if (name === "../hooks/useSyscoinSubmitProofs") {
      return {
        __esModule: true,
        default: () => ({ mutate: submitSponsored, error: sponsorshipError }),
      };
    }
    if (name === "../hooks/useFeatureFlags") {
      return { useFeatureFlags: () => ({ isEnabled: () => true }) };
    }
    if (name === "../NEVMStepWrapepr") return { __esModule: true, default: () => null };
    return require(name);
  },
  componentExports
);

const submitButton = () =>
  componentExports.TestSubmitProofs({ successStatus: "finalizing" })
    .props.children.find((child: any) => child?.props?.onClick);

describe("proof sponsorship fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sponsorshipError = undefined;
  });

  it("starts with the sponsored submission", () => {
    const button = submitButton();
    expect(button.props.children).toBe("Submit Proof");
    button.props.onClick();

    expect(submitSponsored).toHaveBeenCalledTimes(1);
    expect(submitFromWallet).not.toHaveBeenCalled();
  });

  it("requires an explicit wallet submission if sponsorship is unavailable", () => {
    sponsorshipError = new ProofSponsorshipUnavailableError("Below sponsored minimum");

    const button = submitButton();
    expect(button.props.children).toBe("Submit Proof With Wallet");
    expect(submitFromWallet).not.toHaveBeenCalled();
    button.props.onClick();

    expect(submitFromWallet).toHaveBeenCalledTimes(1);
    expect(submitSponsored).not.toHaveBeenCalled();
  });
});
