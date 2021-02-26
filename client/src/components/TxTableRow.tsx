import * as React from "react";

import "styles/animate.scss";
import { TransactionState } from "providers/transactions";
import { useSelectTransaction } from "providers/transactions/selected";
import { useSlotTiming } from "providers/slot";
import type { SlotTiming } from "providers/slot";

interface Props {
  transaction: TransactionState;
}

function timeElapsed(
  sentAt: number | undefined,
  receivedAt: number | undefined
): string | undefined {
  if (sentAt === undefined || receivedAt === undefined) return;
  return parseFloat(((receivedAt - sentAt) / 1000).toFixed(3)) + "s";
}

export function TxTableRow({ transaction }: Props) {
  const signature = transaction.details.signature;
  const selectTransaction = useSelectTransaction();
  const slotMetrics = useSlotTiming();

  let targetSlot;
  let landedSlot;
  if (transaction.status === "success") {
    targetSlot = transaction.slot.target;
    landedSlot = transaction.slot.landed;
  } else if (transaction.status === "timeout") {
  } else {
    targetSlot = transaction.pending.targetSlot;
  }

  let slotTiming: SlotTiming | undefined;
  if (landedSlot !== undefined) {
    slotTiming = slotMetrics.current.get(landedSlot);
  }

  return (
    <tr className="debug-row" onClick={() => selectTransaction(signature)}>
      <td className="text-monospace">{signature.slice(0, 7)}…</td>
      <td>{targetSlot || "-"}</td>
      <td>{landedSlot || "-"}</td>
      <td>{slotTiming?.numTransactions || "-"}</td>
      <td>{slotTiming?.numEntries || "-"}</td>
      <td>{slotTiming?.maxTpe || "-"}</td>
      <td>
        {timeElapsed(slotTiming?.firstShred, slotTiming?.fullSlot) || "-"}
      </td>
      <td>
        {timeElapsed(slotTiming?.firstShred, slotTiming?.replayStart) || "-"}
      </td>
      <td>{timeElapsed(slotTiming?.firstShred, slotTiming?.frozen) || "-"}</td>
      <td>{timeElapsed(slotTiming?.firstShred, slotTiming?.voted) || "-"}</td>
      <td>
        {timeElapsed(slotTiming?.firstShred, slotTiming?.confirmed) || "-"}
      </td>
      <td>{timeElapsed(slotTiming?.firstShred, slotTiming?.rooted) || "-"}</td>
    </tr>
  );
}
