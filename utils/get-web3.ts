import Web3 from "web3";

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.NEVM_RPC_URL!));

export default web3;
