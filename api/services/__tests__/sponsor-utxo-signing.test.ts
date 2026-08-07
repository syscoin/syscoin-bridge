import * as secp256k1 from "@bitcoinerlab/secp256k1";
import { beforeAll, describe, expect, it } from "@jest/globals";
import { ECPairFactory } from "ecpair";
import { utils as syscoinUtils } from "syscoinjs-lib";
import SponsorWalletService from "../sponsor-wallet";

const ECPair = ECPairFactory(secp256k1);
const network = syscoinUtils.syscoinNetworks.testnet;

const makePartiallySignedPsbt = () => {
  const user = ECPair.fromPrivateKey(Uint8Array.from(Buffer.alloc(32, 1)), {
    network,
  });
  const sponsor = ECPair.fromPrivateKey(Uint8Array.from(Buffer.alloc(32, 2)), {
    network,
  });
  const userScript = syscoinUtils.bitcoinjs.payments.p2wpkh({
    pubkey: user.publicKey,
    network,
  }).output!;
  const sponsorScript = syscoinUtils.bitcoinjs.payments.p2wpkh({
    pubkey: sponsor.publicKey,
    network,
  }).output!;
  const psbt = new syscoinUtils.bitcoinjs.Psbt({ network });
  psbt.addInput({
    hash: Buffer.alloc(32, 3),
    index: 0,
    witnessUtxo: { script: userScript, value: BigInt(10_000) },
  });
  psbt.addInput({
    hash: Buffer.alloc(32, 4),
    index: 1,
    witnessUtxo: { script: sponsorScript, value: BigInt(10_000) },
  });
  psbt.addOutput({ script: userScript, value: BigInt(18_000) });
  psbt.signInput(0, user);
  psbt.finalizeInput(0);
  return { psbt, sponsor };
};

describe("mixed-owner sponsored PSBT signing", () => {
  beforeAll(() => {
    process.env.IS_TESTNET = "true";
    syscoinUtils.bitcoinjs.initEccLib(secp256k1);
  });

  it("preserves Pali's finalized user input and signs the sponsor input", async () => {
    const { psbt, sponsor } = makePartiallySignedPsbt();
    const service = new SponsorWalletService() as any;
    const signed = await service.signPreparedUtxo(psbt, sponsor.toWIF());
    const transaction = syscoinUtils.bitcoinjs.Transaction.fromHex(
      signed.rawTransaction
    );

    expect(transaction.ins[0].witness).toHaveLength(2);
    expect(transaction.ins[1].witness).toHaveLength(2);
    expect(transaction.getId()).toBe(signed.txid);
  });

  it("rejects a tampered finalized user witness", async () => {
    const { psbt, sponsor } = makePartiallySignedPsbt();
    const witness = Buffer.from(psbt.data.inputs[0].finalScriptWitness!);
    witness[witness.length - 1] ^= 1;
    psbt.data.inputs[0].finalScriptWitness = witness;

    const service = new SponsorWalletService() as any;
    await expect(
      service.signPreparedUtxo(psbt, sponsor.toWIF())
    ).rejects.toThrow("invalid signature");
  });
});
