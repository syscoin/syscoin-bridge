import { NEVM_RPC_URL } from "@constants";
import Web3 from "web3";

const web3 = new Web3(new Web3.providers.HttpProvider(NEVM_RPC_URL));

export default web3;
