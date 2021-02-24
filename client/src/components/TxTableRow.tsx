import * as React from "react";

import "styles/animate.scss";
import { TransactionState } from "providers/transactions";
import { useSelectTransaction } from "providers/transactions/selected";

interface Props {
  transaction: TransactionState;
}

function timeElapsed(
  sentAt: number,
  receivedAt: number = performance.now()
): number {
  return parseFloat(((receivedAt - sentAt) / 1000).toFixed(3));
}

export function TxTableRow({ transaction }: Props) {
  const signature = transaction.details.signature;
  const selectTransaction = useSelectTransaction();

  let targetSlot;
  let landedSlot;
  let timing;
  let firstReceived;
  let firstReceivedAt;
  if (transaction.status === "success") {
    targetSlot = transaction.slot.target;
    landedSlot = transaction.slot.landed;
    timing = transaction.timing;
    if (transaction.received.length > 0) {
      firstReceived = transaction.received[0];
      firstReceivedAt = timeElapsed(timing.sentAt, firstReceived.receivedAt);
    }
  } else if (transaction.status === "timeout") {
  } else {
    targetSlot = transaction.pending.targetSlot;
    if (transaction.received.length > 0) {
      firstReceived = transaction.received[0];
      firstReceivedAt = timeElapsed(
        transaction.pending.sentAt,
        firstReceived.receivedAt
      );
    }
  }

  return (
    <tr className="debug-row" onClick={() => selectTransaction(signature)}>
      <td className="text-monospace">{signature.slice(0, 10)}...</td>
      <td>{targetSlot || "-"}</td>
      <td>{firstReceived?.slot || "-"}</td>
      <td>{landedSlot || "-"}</td>
      <td>{firstReceivedAt?.toFixed(3) || "-"}</td>
      <td>{timing?.processed?.toFixed(3) || "-"}</td>
      <td>{timing?.confirmed?.toFixed(3) || "-"}</td>
    </tr>
  );
}
