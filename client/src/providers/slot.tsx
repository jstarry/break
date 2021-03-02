import React from "react";
import { useConnection } from "./rpc";

const SlotContext = React.createContext<
  React.MutableRefObject<number | undefined> | undefined
>(undefined);

const SlotMetricsContext = React.createContext<
  React.MutableRefObject<Map<number, SlotTiming>> | undefined
>(undefined);

const SlotMetricsCounter = React.createContext<number | undefined>(undefined);

export type SlotTiming = {
  firstShred: number;
  fullSlot?: number;
  replayStart?: number;
  frozen?: number;
  numEntries?: number;
  numTransactions?: number;
  maxTpe?: number;
  voted?: number;
  confirmed?: number;
  rooted?: number;
};

export function useTargetSlotRef() {
  const slotRef = React.useContext(SlotContext);
  if (!slotRef) {
    throw new Error(`useTargetSlotRef must be used within a SlotProvider`);
  }

  return slotRef;
}

export function useSlotTiming() {
  React.useContext(SlotMetricsCounter);
  const ref = React.useContext(SlotMetricsContext);
  if (!ref) {
    throw new Error(`useSlotMetricsRef must be used within a SlotProvider`);
  }

  return ref;
}

type ProviderProps = { children: React.ReactNode };
export function SlotProvider({ children }: ProviderProps) {
  const connection = useConnection();
  const targetSlot = React.useRef<number>();
  const slotMetrics = React.useRef(new Map<number, SlotTiming>());
  const [metricsCounter, setCounter] = React.useState(0);

  React.useEffect(() => {
    if (connection === undefined) return;

    let disabledSlotSubscription = false;
    const slotSubscription = connection.onSlotChange(({ slot }) => {
      targetSlot.current = slot;
    });

    const interval = setInterval(() => {
      setCounter((c) => c + 1);
    }, 1000);

    const slotUpdateSubscription = connection.onSlotUpdate((notification) => {
      // Remove if slot update api is active
      if (!disabledSlotSubscription) {
        connection.removeSlotChangeListener(slotSubscription);
        disabledSlotSubscription = true;
      }

      const { type, slot, timestamp } = notification;
      if (type === "firstShredReceived") {
        targetSlot.current = Math.max(slot, targetSlot.current || 0);
        slotMetrics.current.set(slot, {
          firstShred: timestamp,
        });
        return;
      }

      const slotTiming = slotMetrics.current.get(slot);
      if (!slotTiming) {
        return;
      }

      switch (type) {
        case "allShredsReceived": {
          slotTiming.fullSlot = timestamp;
          break;
        }
        case "startReplay": {
          slotTiming.replayStart = timestamp;
          break;
        }
        case "frozen": {
          slotTiming.frozen = timestamp;
          const entryStats = (notification as any).entry_stats;
          slotTiming.numEntries = entryStats.numEntries;
          slotTiming.numTransactions = entryStats.numTransactions;
          slotTiming.maxTpe = entryStats.maxTxPerEntry;
          break;
        }
        case "voted": {
          slotTiming.voted = timestamp;
          break;
        }
        case "optimisticConfirmation": {
          slotTiming.confirmed = timestamp;
          break;
        }
        case "root": {
          slotTiming.rooted = timestamp;
          break;
        }
      }
    });

    return () => {
      clearInterval(interval);
      if (!disabledSlotSubscription) {
        connection.removeSlotChangeListener(slotSubscription);
      }
      connection.removeSlotUpdateListener(slotUpdateSubscription);
    };
  }, [connection]);

  return (
    <SlotContext.Provider value={targetSlot}>
      <SlotMetricsContext.Provider value={slotMetrics}>
        <SlotMetricsCounter.Provider value={metricsCounter}>
          {children}
        </SlotMetricsCounter.Provider>
      </SlotMetricsContext.Provider>
    </SlotContext.Provider>
  );
}
