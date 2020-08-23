import * as React from "react";
import { Blockhash, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  Dispatch,
  PendingTransaction,
  TransactionDetails,
  useTargetSlotRef,
  useDispatch,
} from "./index";
import { AccountsConfig } from "../api/config";
import { useConfig, useAccounts } from "providers/api";
import { reportError } from "utils";
import {
  CreateTransactionRPC,
  CreateTransactionResponseMessage,
} from "../../workers/create-transaction-rpc";
import { useWorkerState, WORKER } from "providers/worker";

const SEND_TIMEOUT_MS = 45000;
const RETRY_INTERVAL_MS = 500;

export const CreateTxContext = React.createContext<
  React.MutableRefObject<() => void | undefined> | undefined
>(undefined);

type ProviderProps = { children: React.ReactNode };
export function CreateTxProvider({ children }: ProviderProps) {
  const createTx = React.useRef(() => {});
  const config = useConfig();
  const accounts = useAccounts();
  const idCounter = React.useRef<number>(0);
  const targetSlotRef = useTargetSlotRef();
  const programDataAccount = accounts?.programAccounts[0].toBase58();
  const workerState = useWorkerState();

  // Reset counter when program data accounts are refreshed
  React.useEffect(() => {
    idCounter.current = 0;
  }, [programDataAccount]);

  const dispatch = useDispatch();
  React.useEffect(() => {
    createTx.current = () => {
      if (
        workerState === "loading" ||
        !config ||
        !accounts ||
        !targetSlotRef.current
      )
        return;
      const id = idCounter.current;
      if (id < accounts.accountCapacity * accounts.programAccounts.length) {
        idCounter.current++;
        createTransaction(
          targetSlotRef.current,
          accounts,
          id,
          dispatch,
        );
      } else {
        reportError(
          new Error("Account capacity exceeded"),
          "failed to create transaction"
        );
      }
    };
  }, [config, accounts, workerState, dispatch, targetSlotRef]);

  return (
    <CreateTxContext.Provider value={createTx}>
      {children}
    </CreateTxContext.Provider>
  );
}

export function createTransaction(
  targetSlot: number,
  accounts: AccountsConfig,
  trackingId: number,
  dispatch: Dispatch,
) {
  const { feeAccounts, programAccounts } = accounts;

  const bitId = Math.floor(trackingId / feeAccounts.length);
  const accountIndex = trackingId % feeAccounts.length;
  const programDataAccount = programAccounts[accountIndex];
  const feeAccount = feeAccounts[accountIndex];

  WORKER
    .createTransaction({
      type: "create",
      trackingId: trackingId,
    })
    .then(
      (response: CreateTransactionResponseMessage) => {
        const { signature } = response;
        const sentAt = performance.now();
        const pendingTransaction: PendingTransaction = { sentAt, targetSlot };
        pendingTransaction.timeoutId = window.setTimeout(() => {
          dispatch({ type: "timeout", trackingId });
        }, SEND_TIMEOUT_MS);

        const details: TransactionDetails = {
          id: bitId,
          feeAccount: feeAccount.publicKey,
          programAccount: programDataAccount,
          signature: bs58.encode(signature),
        };

        dispatch({
          type: "new",
          details,
          trackingId,
          pendingTransaction,
        });

        // setTimeout(() => {
        //   const retryUntil = new URLSearchParams(window.location.search).get(
        //     "retry_until"
        //   );
        //   if (retryUntil === null || retryUntil !== "disabled") {
        //     pendingTransaction.retryId = window.setInterval(() => {
        //       if (socket.readyState === WebSocket.OPEN) {
        //         socket.send(serializedTransaction);
        //       }
        //     }, RETRY_INTERVAL_MS);
        //   }
        // }, 1);
      },
      (error: any) => {
        console.error(error);
      }
    );
}
