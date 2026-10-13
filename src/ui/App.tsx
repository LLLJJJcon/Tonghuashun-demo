// 应用外壳：加载数据 → 错误页 / 页面
import { useCallback, useEffect, useState } from 'react';
import { Footer, IssuesButton, Onboarding, ToastHost } from './components/Chrome';
import { TopBar } from './components/TopBar';
import { TraceDrawer } from './components/TraceDrawer';
import { loadAll, type LoadResult } from './data';
import { EventPage } from './pages/EventPage';
import { HomePage } from './pages/HomePage';
import { useRoute } from './router';
import { AppProvider, useApp } from './store';

export function App() {
  const [result, setResult] = useState<LoadResult | null>(null);
  const load = useCallback(() => {
    setResult(null);
    loadAll().then(setResult, (e: unknown) =>
      setResult({ ok: false, failures: [{ file: '（未知）', message: e instanceof Error ? e.message : String(e) }] }),
    );
  }, []);
  useEffect(load, [load]);

  if (!result) return <div className="loading">正在加载数据…</div>;
  if (!result.ok) {
    return (
      <main className="error-page" role="alert">
        <h1>数据加载失败</h1>
        <p>以下数据文件无法加载或解析：</p>
        <ul>
          {result.failures.map((f) => (
            <li key={f.file}>
              <code>{f.file}</code>：{f.message}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary" onClick={load}>
          重试
        </button>
      </main>
    );
  }
  return (
    <AppProvider loaded={result.value}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { focus } = useApp();
  const routeKey = route.name === 'event' ? `event:${route.id}` : 'home';
  useEffect(() => {
    if (!focus) window.scrollTo(0, 0);
    // 只在路由变化时回到顶部
  }, [routeKey]);

  return (
    <div className="app">
      <TopBar route={route} />
      <Onboarding />
      <main className="main">{route.name === 'event' ? <EventPage key={route.id} id={route.id} /> : <HomePage />}</main>
      <Footer />
      <IssuesButton />
      <TraceDrawer />
      <ToastHost />
    </div>
  );
}
