// eslint-disable-next-line import/no-webpack-loader-syntax
import CreateTransactionWorker from "worker-loader!./create-transaction-worker-script";
import { AccountsConfig } from "providers/api/config";
import { PublicKey, Blockhash } from "@solana/web3.js";

export type CreateTransactionResponseMessage = {
  trackingId: number;
  signature: Buffer;
}

export type CreateTransactionErrorMessage = {
  trackingId: string;
  error: Error;
}

export type MessageType = "create" | "init" | "accounts" | "blockhash";

export type CreateTransactionMessage = {
  type: "create";
  trackingId: number;
}

export type InitializeWorkerMessage = {
  type: "init";
  programId: string;
  clusterUrl: string;
}

export type AccountsWorkerMessage = {
  type: "accounts";
  feeAccounts: Buffer[],
  programAccounts: string[],
}

export type BlockhashWorkerMessage = {
  type: "blockhash";
  blockhash: Blockhash;
}

export type WorkerMessage = 
  CreateTransactionMessage |
  InitializeWorkerMessage |
  AccountsWorkerMessage |
  BlockhashWorkerMessage;

export class CreateTransactionRPC {
  private worker: CreateTransactionWorker;

  private callbacks: { [trackingId: string]: Function[] } = {};
  private onReady: (() => void) | undefined;

  constructor() {
    this.worker = new CreateTransactionWorker();
    this.worker.onmessage = this.handleMessages.bind(this);
  }

  private handleMessages(event: MessageEvent) {
    let message = event.data;
    if (message === "ready" && this.onReady) {
      this.onReady();
    }

    if (message.trackingId in this.callbacks) {
      let callbacks = this.callbacks[message.trackingId];
      delete this.callbacks[message.trackingId];

      if ("error" in message) {
        callbacks[1](message.error);
        return;
      }

      callbacks[0](message);
    }
  }

  setReadyListener(onReady: () => void) {
    this.onReady = onReady;
  }

  send(message: InitializeWorkerMessage | AccountsWorkerMessage | BlockhashWorkerMessage) {
    this.worker.postMessage(message);
  }

  accounts(message: AccountsWorkerMessage) {
    this.worker.postMessage(message);
  }

  createTransaction(
    message: CreateTransactionMessage
  ): Promise<CreateTransactionResponseMessage> {
    return new Promise((resolve, reject) => {
      this.callbacks[message.trackingId] = [resolve, reject];
      this.worker.postMessage(message);
    });
  }
}
