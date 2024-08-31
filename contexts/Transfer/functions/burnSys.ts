import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import satoshibitcoin from "satoshi-bitcoin";
import bitcoin from "bitcoinjs-lib"

export const burnSys = async (
  syscoinInstance: syscoin,
  amount: string,
  sysChangeAddress: string,
  xpubAddress: string,
  ethAddressStripped: string
) => {
  const feeRate = new syscoinUtils.BN(10);
  const txOpts = { rbf: true };
  const outputsArr = []
  const dataScript = bitcoin.payments.embed({ data: [Buffer.from(ethAddressStripped, "hex")] }).output
  const dataOutput = {
    script: dataScript,
    value: new syscoinUtils.BN(satoshibitcoin.toSatoshi(amount))
  }
  outputsArr.push(dataOutput)
  console.log("burnSys", {
    feeRate,
    txOpts,
    sysChangeAddress,
  });
  const res = await syscoinInstance.createTransaction(
    txOpts,
    sysChangeAddress,
    outputsArr,
    feeRate,
    xpubAddress
  );
  if (!res) {
    throw new Error("Could not create transaction, not enough funds?", {
      cause: res,
    });
  }
  return syscoinUtils.exportPsbtToJson(res.psbt);
};

export default burnSys;
