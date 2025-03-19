import { useQuery } from "react-query";

type ConstantsPayload = {
  contracts: {
    relayContract: { address: string };
    ecr20ManagerContract: { address: string };
  };
};

export const useConstants = () =>
  useQuery<unknown, unknown, ConstantsPayload>("constants", () => {
    return fetch("/api/flags").then((res) => res.json());
  });
