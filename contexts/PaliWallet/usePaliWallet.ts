import { useContext } from "react";
import { PaliWalletContext } from "./Provider";
import { IPaliWalletV2Context } from "./V2Provider";


export const usePaliWallet = () => useContext(PaliWalletContext);

export const usePaliWalletV2 = () => useContext(PaliWalletContext) as IPaliWalletV2Context;