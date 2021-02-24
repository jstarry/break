import * as React from "react";
import { useThrottle } from "@react-hook/throttle";
import { TransactionSignature, PublicKey } from "@solana/web3.js";
import { ConfirmedHelper } from "./confirmed";
import { TpsProvider, TpsContext } from "./tps";
import { CreateTxContext, CreateTxProvider } from "./create";
import { SelectedTxProvider } from "./selected";
import { useConnection } from "providers/rpc";

export type ReceivedRecord = {
  receivedAt: number;
  slot: number;
};

export type PendingTransaction = {
  sentAt: number;
  targetSlot: number;
  retryId?: number;
  timeoutId?: number;
};

export type TransactionDetails = {
  id: number;
  feeAccount: PublicKey;
  programAccount: PublicKey;
  signature: TransactionSignature;
};

type Timing = {
  sentAt: number;
  processed?: number;
  confirmed?: number;
};

type TimeoutState = {
  status: "timeout";
  details: TransactionDetails;
};

type PendingState = {
  status: "pending";
  details: TransactionDetails;
  received: Array<ReceivedRecord>;
  pending: PendingTransaction;
};

type SuccessState = {
  status: "success";
  details: TransactionDetails;
  received: Array<ReceivedRecord>;
  slot: {
    target: number;
    landed: number;
  };
  timing: Timing;
  pending?: PendingTransaction;
};

export const COMMITMENT_PARAM = ((): TrackedCommitment => {
  const commitment = new URLSearchParams(window.location.search).get(
    "commitment"
  );
  switch (commitment) {
    case "recent": {
      return commitment;
    }
    default: {
      return "singleGossip";
    }
  }
})();

export const getCommitmentName = (
  commitment: TrackedCommitment
): CommitmentName => {
  if (commitment === "singleGossip") {
    return "confirmed";
  } else {
    return "processed";
  }
};

export type CommitmentName = "processed" | "confirmed";

export type TrackedCommitment = "singleGossip" | "recent";

export type TransactionStatus = "success" | "timeout" | "pending";

export type TransactionState = SuccessState | TimeoutState | PendingState;

type NewTransaction = {
  type: "new";
  trackingId: number;
  details: TransactionDetails;
  pendingTransaction: PendingTransaction;
};

type UpdateIds = {
  type: "update";
  activeIdPartition: {
    ids: Set<number>;
    partition: number;
    partitionCount: number;
  };
  commitment: TrackedCommitment;
  receivedAt: number;
  estimatedSlot: number;
};

type TrackTransaction = {
  type: "track";
  commitmentName: CommitmentName;
  trackingId: number;
  slot: number;
  receivedAt: number;
};

type TimeoutTransaction = {
  type: "timeout";
  trackingId: number;
};

type ResetState = {
  type: "reset";
};

type RecordRoot = {
  type: "root";
  root: number;
};

type SignatureReceived = {
  type: "received";
  trackingId: number;
  slot: number;
  receivedAt: number;
};

type Action =
  | NewTransaction
  | UpdateIds
  | TimeoutTransaction
  | ResetState
  | RecordRoot
  | TrackTransaction
  | SignatureReceived;

type State = TransactionState[];
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "new": {
      const { details, pendingTransaction } = action;
      return [
        ...state,
        {
          details,
          status: "pending",
          received: [],
          pending: pendingTransaction,
        },
      ];
    }

    case "received": {
      const trackingId = action.trackingId;
      if (trackingId >= state.length) return state;
      const transaction = state[trackingId];
      return state.map((tx) => {
        if (tx.details.signature === transaction.details.signature) {
          if (tx.status !== "timeout") {
            return {
              ...tx,
              received: [
                ...tx.received,
                {
                  slot: action.slot,
                  receivedAt: action.receivedAt,
                },
              ],
            };
          }
        }
        return tx;
      });
    }

    case "track": {
      const trackingId = action.trackingId;
      if (trackingId >= state.length) return state;
      const transaction = state[trackingId];

      return state.map((tx) => {
        if (tx.details.signature === transaction.details.signature) {
          if (tx.status === "pending") {
            return {
              status: "success",
              details: tx.details,
              received: tx.received,
              slot: {
                target: tx.pending.targetSlot,
                landed: action.slot,
              },
              timing: {
                sentAt: tx.pending.sentAt,
                [action.commitmentName]: timeElapsed(
                  tx.pending.sentAt,
                  action.receivedAt
                ),
              },
              pending: tx.pending,
            };
          } else if (tx.status === "success") {
            return {
              ...tx,
              slot: {
                ...tx.slot,
                landed: action.slot,
              },
              timing: {
                ...tx.timing,
                [action.commitmentName]: timeElapsed(
                  tx.timing.sentAt,
                  action.receivedAt
                ),
              },
            };
          }
        }
        return tx;
      });
    }

    case "timeout": {
      const trackingId = action.trackingId;
      if (trackingId >= state.length) return state;
      const timeout = state[trackingId];
      if (timeout.status !== "pending") return state;
      clearInterval(timeout.pending.retryId);

      return state.map((tx) => {
        if (tx.details.signature === timeout.details.signature) {
          return {
            status: "timeout",
            details: tx.details,
          };
        } else {
          return tx;
        }
      });
    }

    case "update": {
      const { ids, partition, partitionCount } = action.activeIdPartition;
      return state.map((tx, trackingId) => {
        if (trackingId % partitionCount !== partition) return tx;
        const id = Math.floor(trackingId / partitionCount);
        if (tx.status === "pending" && ids.has(id)) {
          // Optimistically confirmed, no need to continue retry
          if (action.commitment === "singleGossip") {
            clearInterval(tx.pending.retryId);
            clearTimeout(tx.pending.timeoutId);
          }

          const commitmentName = getCommitmentName(action.commitment);
          return {
            status: "success",
            details: tx.details,
            received: tx.received,
            slot: {
              target: tx.pending.targetSlot,
              landed: action.estimatedSlot,
            },
            timing: {
              sentAt: tx.pending.sentAt,
              [commitmentName]: timeElapsed(
                tx.pending.sentAt,
                action.receivedAt
              ),
            },
            pending: tx.pending,
          };
        } else if (tx.status === "success") {
          if (ids.has(id)) {
            const commitmentName = getCommitmentName(action.commitment);
            // Already recorded conf time
            if (tx.timing[commitmentName] !== undefined) {
              return tx;
            }

            // Optimistically confirmed, no need to continue retry
            if (tx.pending && action.commitment === "singleGossip") {
              clearInterval(tx.pending.retryId);
              clearTimeout(tx.pending.timeoutId);
            }

            return {
              ...tx,
              timing: {
                ...tx.timing,
                [commitmentName]: timeElapsed(
                  tx.timing.sentAt,
                  action.receivedAt
                ),
              },
            };
          } else if (
            action.commitment === "recent" &&
            tx.pending &&
            !ids.has(id)
          ) {
            // Don't revert to pending state if we already received timing info for other commitments
            if (tx.timing["confirmed"] !== undefined) {
              return {
                ...tx,
                timing: {
                  ...tx.timing,
                  processed: undefined,
                },
              };
            }

            // Revert to pending state because the previous notification likely came from a fork
            return {
              status: "pending",
              details: tx.details,
              received: tx.received,
              pending: { ...tx.pending },
            };
          }
        }
        return tx;
      });
    }

    case "reset": {
      state.forEach((tx) => {
        if (tx.status === "pending") {
          clearTimeout(tx.pending.timeoutId);
          clearInterval(tx.pending.retryId);
        } else if (tx.status === "success" && tx.pending) {
          clearTimeout(tx.pending.timeoutId);
          clearInterval(tx.pending.retryId);
        }
      });
      return [];
    }

    case "root": {
      const foundRooted = state.find((tx) => {
        if (tx.status === "success" && tx.pending) {
          return tx.slot.landed === action.root;
        } else {
          return false;
        }
      });

      // Avoid re-allocating state map
      if (!foundRooted) return state;

      return state.map((tx) => {
        if (tx.status === "success" && tx.pending) {
          if (tx.slot.landed === action.root) {
            clearInterval(tx.pending.retryId);
            clearTimeout(tx.pending.timeoutId);
            return {
              ...tx,
              pending: undefined,
            };
          }
        }
        return tx;
      });
    }
  }
}

export type Dispatch = (action: Action) => void;
const StateContext = React.createContext<State | undefined>(undefined);
const DispatchContext = React.createContext<Dispatch | undefined>(undefined);

type ProviderProps = { children: React.ReactNode };
export function TransactionsProvider({ children }: ProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, []);
  const connection = useConnection();
  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    dispatch({
      type: "reset",
    });

    if (connection === undefined) return;
    const rootSubscription = connection.onRootChange((root) => {
      dispatch({ type: "root", root });
    });

    return () => {
      connection.removeRootChangeListener(rootSubscription);
    };
  }, [connection]);

  const [throttledState, setThrottledState] = useThrottle(state, 10);
  React.useEffect(() => {
    setThrottledState(state);
  }, [state, setThrottledState]);

  return (
    <StateContext.Provider value={throttledState}>
      <DispatchContext.Provider value={dispatch}>
        <SelectedTxProvider>
          <CreateTxProvider>
            <ConfirmedHelper>
              <TpsProvider>{children}</TpsProvider>
            </ConfirmedHelper>
          </CreateTxProvider>
        </SelectedTxProvider>
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

function timeElapsed(
  sentAt: number,
  receivedAt: number = performance.now()
): number {
  return parseFloat(((receivedAt - sentAt) / 1000).toFixed(3));
}

export function useDispatch() {
  const dispatch = React.useContext(DispatchContext);
  if (!dispatch) {
    throw new Error(`useDispatch must be used within a TransactionsProvider`);
  }

  return dispatch;
}

export function useTransactions() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(
      `useTransactions must be used within a TransactionsProvider`
    );
  }

  return state;
}

export function useConfirmedCount() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(
      `useConfirmedCount must be used within a TransactionsProvider`
    );
  }
  return state.filter(({ status }) => status === "success").length;
}

export function useDroppedCount() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(
      `useDroppedCount must be used within a TransactionsProvider`
    );
  }
  return state.filter(({ status }) => status === "timeout").length;
}

export function useAvgConfirmationTime() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(
      `useAvgConfirmationTime must be used within a TransactionsProvider`
    );
  }

  const confirmed = state.reduce((confirmed: number[], tx) => {
    if (tx.status === "success") {
      const confTime = tx.timing[getCommitmentName(COMMITMENT_PARAM)];
      if (confTime !== undefined) confirmed.push(confTime);
    }
    return confirmed;
  }, []);

  const count = confirmed.length;
  if (count === 0) return 0;
  const sum = confirmed.reduce((sum, time) => sum + time, 0);
  return sum / count;
}

export function useCreatedCount() {
  const state = React.useContext(StateContext);
  if (!state) {
    throw new Error(
      `useCreatedCount must be used within a TransactionsProvider`
    );
  }
  return state.length;
}

export function useTps() {
  const tps = React.useContext(TpsContext);
  if (tps === undefined)
    throw new Error(`useTps must be used within a TransactionsProvider`);
  return tps;
}

export function useCreateTxRef() {
  const createTxRef = React.useContext(CreateTxContext);
  if (createTxRef === undefined)
    throw new Error(
      `useCreateTxRef must be used within a TransactionsProvider`
    );
  return createTxRef;
}
