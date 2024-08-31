import { useMemo } from "react";
import { useWeb3 } from "./Web";
import relayAbi from "@contexts/Transfer/relay-abi";
import {RELAY_CONTRACT_ADDRESS} from "@constants"
export const useRelayContract = () => {
  const web3 = useWeb3();
  return useMemo(
    () =>
      new web3.eth.Contract(
        relayAbi,
        RELAY_CONTRACT_ADDRESS
      ),
    [web3]
  );
};
