import * as React from "react";
import { CreateTransactionRPC } from "workers/create-transaction-rpc";
import { useConfig, useAccounts } from "./api";
import { useBlockhash } from "./blockhash";

type State = "loading" | "ready";
const StateContext = React.createContext<State | undefined>(undefined);

export const WORKER = new CreateTransactionRPC();

type ProviderProps = { children: React.ReactNode };
export function WorkerProvider({ children }: ProviderProps) {
  const [state, setState] = React.useState<State>("loading");

  const blockhash = useBlockhash();
  React.useEffect(() => {
      if (blockhash) WORKER.send({type: "blockhash", blockhash});
  }, [blockhash]);

  const accounts = useAccounts();
  React.useEffect(() => {
      if (accounts) WORKER.send({type: "accounts",
      feeAccounts: accounts.feeAccounts.map(a => a.secretKey),
      programAccounts: accounts.programAccounts.map(a => a.toBase58())
    });
  }, [accounts]);

  const config = useConfig();
  const programId = config?.programId;
  const clusterUrl = config?.clusterUrl;
  React.useEffect(() => {
      if (programId && clusterUrl) {
        WORKER.send({ type: "init", programId: programId.toBase58(), clusterUrl });
      }
  }, [programId, clusterUrl]);

  React.useEffect(() => {
      WORKER.setReadyListener(() => {
        setState("ready");
      })
  }, []);

  return (
    <StateContext.Provider value={state}>
        {children}
    </StateContext.Provider>
  );
}

export function useWorkerState() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(`useWorkerState must be used within a WorkerProvider`);
  }

  return state;
}
