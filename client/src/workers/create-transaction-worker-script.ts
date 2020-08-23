import {
  Transaction,
  TransactionInstruction,
  PublicKey,
  Account,
  Blockhash,
} from "@solana/web3.js";
import * as Bytes from "utils/bytes";
import { CreateTransactionMessage, WorkerMessage } from "./create-transaction-rpc";
import { AccountsConfig } from "providers/api/config";

const self: any = globalThis;

let clusterUrl: string;
let programId: PublicKey;
let feeAccounts: Account[];
let programAccounts: PublicKey[];
let blockhash: Blockhash;
let socket = new WebSocket("wss://break-solana-testnet.herokuapp.com");

function createTransaction(message: CreateTransactionMessage) {
  const { trackingId } = message;

  const bitId = Math.floor(trackingId / feeAccounts.length);
  const accountIndex = trackingId % feeAccounts.length;
  const programDataAccount = programAccounts[accountIndex];
  const feeAccount = feeAccounts[accountIndex];

  const instruction = new TransactionInstruction({
    keys: [
      {
        pubkey: programDataAccount,
        isWritable: true,
        isSigner: false,
      },
    ],
    programId,
    data: Buffer.from(Bytes.instructionDataFromId(bitId)),
  });

  const transaction = new Transaction();
  transaction.add(instruction);
  transaction.recentBlockhash = blockhash;
  transaction.sign(feeAccount);

  const signatureBuffer = transaction.signature;
  const serializedTransaction = transaction.serialize();
  socket.send(serializedTransaction);

  self.postMessage({
    trackingId: trackingId,
    signature: signatureBuffer,
  });
}

self.onmessage = (event: any) => {
  const message: WorkerMessage = event.data;
  switch(message.type) {
    case "init": {
      clusterUrl = message.clusterUrl;
      programId = new PublicKey(message.programId);
      break;
    }

    case "accounts": {
      feeAccounts = message.feeAccounts.map(a => new Account(a));
      programAccounts = message.programAccounts.map(a => new PublicKey(a));
      break;
    }

    case "blockhash": {
      blockhash = message.blockhash;
      break;
    }

    case "create": {
      try {
        createTransaction(message);
      } catch (error) {
        self.postMessage({
          trackingId: message.trackingId,
          error: error,
        });
      }
      return;
    }
  }

  if (clusterUrl && programId && programAccounts && blockhash) {
    self.postMessage("ready");
  }

};

export default {};
