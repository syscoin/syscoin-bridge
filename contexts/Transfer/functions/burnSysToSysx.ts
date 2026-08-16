import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { exportPsbtWithPrevouts } from "utils/psbt-prevouts";
import { SYSX_ASSET_GUID } from "../constants";

export const burnSysToSysx = async (
  syscoinInstance: syscoin,
  amount: string,
  xpub: string,
  sysAddress: string
) => {
  const feeRate = new syscoinUtils.BN(10);
  const txOpts = { rbf: true };
  const assetGuid = SYSX_ASSET_GUID;
  const assetChangeAddress = sysAddress;
  const assetMap = new Map([
    [
      assetGuid,
      {
        changeAddress: assetChangeAddress,
        outputs: [
          {
            value: new syscoinUtils.BN(toSyscoinBaseUnits(amount)),
            address: assetChangeAddress,
          },
        ],
      },
    ],
  ]);
  console.log("burnSysToSysx", {
    feeRate,
    txOpts,
    assetGuid,
    assetChangeAddress,
    assetMap,
  });
  const res = await syscoinInstance.syscoinBurnToAssetAllocation(
    txOpts,
    assetMap,
    assetChangeAddress,
    feeRate,
    xpub
  );
  if (!res) {
    throw new Error("Unable to create the SYS burn transaction");
  }
  console.log("burnSysToSysx", { res });
  return exportPsbtWithPrevouts(res.psbt, res.assets);
};

export default burnSysToSysx;
