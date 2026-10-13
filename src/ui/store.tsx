// 全局状态：只维护 D8（复核记录）和 D9（演示状态），每次变化都交给 derive() 重算
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DataIssue, DemoState, DeriveOutput, EngineInput, ReviewEntry } from '../types';
import type { LoadedData } from './data';
import { derive, nextCheckpoint } from './engineApi';
import { KEY_DEMO, KEY_REVIEWS, loadDemo, loadReviews, storageAvailable, writeJSON } from './storage';

interface AppState {
  reviews: ReviewEntry[];
  demo: DemoState;
}

type Action =
  | { type: 'setClock'; clock: string | null }
  | { type: 'addReview'; entry: ReviewEntry }
  | { type: 'markRead'; ids: string[] }
  | { type: 'dismissOnboarding' }
  | { type: 'setWatchlist'; codes: string[] }
  | { type: 'reset'; watchlist: string[] };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setClock':
      return { ...s, demo: { ...s.demo, clock: a.clock } };
    case 'addReview':
      return { ...s, reviews: [...s.reviews, a.entry] };
    case 'markRead': {
      const set = new Set(s.demo.read_notification_ids);
      a.ids.forEach((id) => set.add(id));
      return { ...s, demo: { ...s.demo, read_notification_ids: [...set] } };
    }
    case 'dismissOnboarding':
      return { ...s, demo: { ...s.demo, onboarding_dismissed: true } };
    case 'setWatchlist':
      return { ...s, demo: { ...s.demo, watchlist: a.codes } };
    case 'reset':
      return {
        reviews: [],
        demo: { clock: null, read_notification_ids: [], onboarding_dismissed: false, watchlist: a.watchlist },
      };
  }
}

export interface TraceTarget {
  docId: string;
  quote?: string;
  claimId?: string;
}

/** 跳转后需要滚动并高亮的目标（DOM id） */
export interface FocusTarget {
  eventId: string;
  elementId: string;
  nonce: number;
}

interface Toast {
  text: string;
  kind: 'ok' | 'info';
  nonce: number;
}

interface AppContextValue {
  loaded: LoadedData;
  state: AppState;
  dispatch: (a: Action) => void;
  input: EngineInput;
  output: DeriveOutput;
  issues: DataIssue[];
  storageOk: boolean;
  defaultWatchlist: string[];
  stepNext: () => void;
  trace: TraceTarget | null;
  openTrace: (t: TraceTarget) => void;
  closeTrace: () => void;
  toast: Toast | null;
  showToast: (text: string, kind?: 'ok' | 'info') => void;
  focus: FocusTarget | null;
  setFocus: (eventId: string, elementId: string) => void;
  clearFocus: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export function AppProvider({ loaded, children }: { loaded: LoadedData; children: ReactNode }) {
  const defaultWatchlist = useMemo(() => loaded.seed.stocks.map((s) => s.code), [loaded]);
  const [storageOk, setStorageOk] = useState(() => storageAvailable());
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    reviews: loadReviews(),
    demo: loadDemo(defaultWatchlist),
  }));

  // 持久化：失败时退回内存状态并提示
  useEffect(() => {
    if (!storageOk) return;
    const ok = writeJSON(KEY_REVIEWS, state.reviews) && writeJSON(KEY_DEMO, state.demo);
    if (!ok) setStorageOk(false);
  }, [state, storageOk]);

  const input = useMemo<EngineInput>(
    () => ({ ...loaded.data, reviews: state.reviews, clock: state.demo.clock, watchlist: state.demo.watchlist }),
    [loaded, state.reviews, state.demo.clock, state.demo.watchlist],
  );
  const output = useMemo(() => derive(input), [input]);

  const issues = useMemo(() => {
    const seen = new Set<string>();
    const all: DataIssue[] = [];
    for (const i of [...loaded.issues, ...output.issues]) {
      const k = `${i.level}|${i.file}|${i.record_id ?? ''}|${i.message}`;
      if (!seen.has(k)) {
        seen.add(k);
        all.push(i);
      }
    }
    return all;
  }, [loaded.issues, output.issues]);

  const stepNext = useCallback(() => {
    const next = nextCheckpoint(output.checkpoints, state.demo.clock);
    if (next !== null) dispatch({ type: 'setClock', clock: next });
  }, [output.checkpoints, state.demo.clock]);

  const [trace, setTrace] = useState<TraceTarget | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((text: string, kind: 'ok' | 'info' = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, kind, nonce: Date.now() });
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'info' ? 6000 : 3500);
  }, []);

  const [focus, setFocusState] = useState<FocusTarget | null>(null);
  const setFocus = useCallback(
    (eventId: string, elementId: string) => setFocusState({ eventId, elementId, nonce: Date.now() }),
    [],
  );
  const clearFocus = useCallback(() => setFocusState(null), []);

  const value: AppContextValue = {
    loaded,
    state,
    dispatch,
    input,
    output,
    issues,
    storageOk,
    defaultWatchlist,
    stepNext,
    trace,
    openTrace: setTrace,
    closeTrace: () => setTrace(null),
    toast,
    showToast,
    focus,
    setFocus,
    clearFocus,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
