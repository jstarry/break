import React from "react";
import { useConnection } from "./rpc";

const SlotContext = React.createContext<
  React.MutableRefObject<number | undefined> | undefined
>(undefined);

const SlotMetricsContext = React.createContext<
  React.MutableRefObject<Map<number, SlotTiming>> | undefined
>(undefined);

type SlotTiming = {
  firstShred: number;
  frozen?: number;
  confirmed?: number;
};

export function useTargetSlotRef() {
  const slotRef = React.useContext(SlotContext);
  if (!slotRef) {
    throw new Error(`useTargetSlotRef must be used within a SlotProvider`);
  }

  return slotRef;
}

type ProviderProps = { children: React.ReactNode };
export function SlotProvider({ children }: ProviderProps) {
  const connection = useConnection();
  const targetSlot = React.useRef<number>();
  const slotMetrics = React.useRef(new Map<number, SlotTiming>());

  React.useEffect(() => {
    if (connection === undefined) return;

    let disabledSlotSubscription = false;
    const slotSubscription = connection.onSlotChange(({ slot }) => {
      targetSlot.current = slot;
    });

    const slotUpdateSubscription = connection.onSlotUpdate(
      ({ type, slot, timestamp }) => {
        // Remove if slot update api is active
        if (!disabledSlotSubscription) {
          connection.removeSlotChangeListener(slotSubscription);
          disabledSlotSubscription = true;
        }

        if (type === "firstShredReceived") {
          slotMetrics.current.set(slot, {
            firstShred: timestamp,
          });
          return;
        }

        const slotTiming = slotMetrics.current.get(slot);
        if (!slotTiming) return;

        if (type === "optimisticConfirmation") {
          slotTiming.confirmed = timestamp;
        } else if (type === "frozen") {
          slotTiming.frozen = timestamp;
        }
      }
    );

    return () => {
      if (!disabledSlotSubscription) {
        connection.removeSlotChangeListener(slotSubscription);
      }
      connection.removeSlotUpdateListener(slotUpdateSubscription);
    };
  }, [connection]);

  return (
    <SlotContext.Provider value={targetSlot}>
      <SlotMetricsContext.Provider value={slotMetrics}>
        {children}
      </SlotMetricsContext.Provider>
    </SlotContext.Provider>
  );
}
