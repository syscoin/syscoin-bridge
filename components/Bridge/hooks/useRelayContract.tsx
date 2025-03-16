import { useMemo } from "react";

import relayAbi from "@contexts/Transfer/relay-abi";
import { useWeb3 } from "../context/Web";

export const useRelayContract = () => {
  const web3 = useWeb3();
  return useMemo(
    () =>
      new web3.eth.Contract(
        relayAbi,
        "0xd714E7915362FF89388025F584726E6dF26D20f9"
      ),
    [web3]
  );
};
