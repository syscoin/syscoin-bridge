import { useMemo } from "react";

import relayAbi from "@contexts/Transfer/relay-abi";
import { useWeb3 } from "../context/Web";
import { useFeatureFlags } from "./useFeatureFlags";
import { useConstants } from "./useConstants";

export const useRelayContract = () => {
  const web3 = useWeb3();
  const flags = useFeatureFlags();
  const { data: constants } = useConstants();

  return useMemo(
    () =>
      new web3.eth.Contract(
        relayAbi,
        flags.isEnabled("isSys5Enabled")
          ? constants?.contracts.relayContract.address
          : "0xd714E7915362FF89388025F584726E6dF26D20f9"
      ),
    [web3, flags, constants]
  );
};
