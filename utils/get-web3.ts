import Web3 from "web3";

const web3 = new Web3(
  new Web3.providers.HttpProvider("https://rpc.syscoin.org")
);

export default web3;
