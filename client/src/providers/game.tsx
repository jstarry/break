import React from "react";
import { useHistory, useRouteMatch, useLocation } from "react-router-dom";
import {
  useConfig,
  useRefreshAccounts,
  useAccounts,
  useIsFetching,
  useClearAccounts,
  useConnection,
} from "providers/api";
import { useDispatch } from "providers/transactions";
import { useWorkerState } from "./worker";
import { useBlockhash } from "./blockhash";

export const COUNTDOWN_SECS = 15;

type GameState = "loading" | "payment" | "play" | "reset";
const GameStateContext = React.createContext<GameState | undefined>(undefined);

type SetCountdown = React.Dispatch<React.SetStateAction<number | undefined>>;
type CountdownState = [number | undefined, SetCountdown];
const CountdownContext = React.createContext<CountdownState | undefined>(
  undefined
);

type Props = { children: React.ReactNode };
export function GameStateProvider({ children }: Props) {
  const [countdown, setCountdown] = React.useState<number>();
  const [gameState, setGameState] = React.useState<GameState>("loading");
  const resultsTimerRef = React.useRef<NodeJS.Timer>();
  const connection = useConnection();
  const history = useHistory();
  const location = useLocation();
  const workerState = useWorkerState();
  const config = useConfig();
  const accounts = useAccounts();
  const blockhash = useBlockhash();
  const isResultsRoute = !!useRouteMatch("/results");
  const isGameRoute = !!useRouteMatch("/game");
  const isFetching = useIsFetching();

  React.useEffect(() => {
    setCountdown(undefined);
  }, [isGameRoute, connection]);

  React.useEffect(() => {
    const paymentRequired = config?.paymentRequired === true;
    const needsPayment = paymentRequired && !isFetching && !accounts;
    const doneLoading =
      workerState === "ready" && config && (needsPayment || accounts);
    if (!doneLoading) {
      setGameState("loading");
    } else if (needsPayment) {
      setGameState("payment");
    } else {
      setGameState((gameState) => {
        if (gameState === "loading" || gameState === "payment") {
          return isResultsRoute ? "reset" : "play";
        }
        return gameState;
      });
    }
  }, [isResultsRoute, isFetching, workerState, config, accounts]);

  React.useEffect(() => {
    if (countdown !== undefined) {
      if (!resultsTimerRef.current) {
        resultsTimerRef.current = setTimeout(() => {
          setGameState("reset");
          history.push({ ...location, pathname: "/results" });
        }, COUNTDOWN_SECS * 1000);
      }
    } else if (resultsTimerRef.current) {
      clearTimeout(resultsTimerRef.current);
      resultsTimerRef.current = undefined;
    }
  }, [countdown, history, location]);

  const countdownState: CountdownState = React.useMemo(() => {
    return [countdown, setCountdown];
  }, [countdown]);

  return (
    <GameStateContext.Provider value={gameState}>
      <CountdownContext.Provider value={countdownState}>
        {children}
      </CountdownContext.Provider>
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const context = React.useContext(GameStateContext);
  if (!context) {
    throw new Error(`useGameState must be used within a GameStateProvider`);
  }
  return context;
}

export function useCountdown() {
  const context = React.useContext(CountdownContext);
  if (!context) {
    throw new Error(`useCountdown must be used within a GameStateProvider`);
  }
  return context;
}

export function useResetGame() {
  const refreshAccounts = useRefreshAccounts();
  const paymentRequired = useConfig()?.paymentRequired;
  const clearAccounts = useClearAccounts();
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();

  return React.useCallback(() => {
    dispatch({ type: "reset" });
    history.push({ ...location, pathname: "/game" });
    if (paymentRequired) {
      clearAccounts();
    } else {
      refreshAccounts();
    }
  }, [
    refreshAccounts,
    paymentRequired,
    clearAccounts,
    history,
    location,
    dispatch,
  ]);
}
