import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '../shared/events/agent-event';
import type { Project } from '../shared/models/project';
import { useAppStore } from './stores/app-store';
import brandIcon from './assets/buildflow.svg';

type IconName = 'grid' | 'plus' | 'arrow' | 'external' | 'spark' | 'clock' | 'check' | 'code' | 'chevron' | 'refresh' | 'monitor' | 'phone' | 'sun' | 'moon';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    external: <><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 17 .5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5L19 17Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    code: <><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    refresh: <><path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 5v6h-6"/></>,
    monitor: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4"/></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const stageLabels: Record<string, string> = {
  analyzing: '요청 확인', editing: '프로그램 작성', testing: '정상 작동 확인',
  'saving-version': '변경 사항 저장', 'starting-app': '실행 준비', completed: '완료', failed: '문제 발생',
};

function statusLabel(project: Project) {
  if (project.status === 'running') return '실행 중';
  if (project.status === 'failed') return '확인 필요';
  if (project.status === 'creating' || project.status === 'modifying') return '작업 중';
  return '준비됨';
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ProjectCard({ project, selected, onClick }: { project: Project; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`project-card ${selected ? 'is-selected' : ''}`} onClick={onClick}>
    <span className="project-card-icon"><Icon name="grid" size={20}/></span>
    <span className="project-card-copy"><strong>{project.name}</strong><small>{dateLabel(project.updatedAt)}</small></span>
    <span className={`status-pill status-${project.status}`}><span className="status-dot"/>{statusLabel(project)}</span>
    <span className="project-card-arrow"><Icon name="chevron" size={17}/></span>
  </button>;
}

export default function App() {
  const s = useAppStore();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('buildflow-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [text, setText] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewWidth, setPreviewWidth] = useState(820);
  const previewRef = useRef<HTMLDivElement>(null);

  const refresh = async () => useAppStore.getState().setProjects(await window.desktop.listProjects());
  const load = async (id: string) => {
    const project = useAppStore.getState().projects.find((item) => item.id === id);
    if (!project) return;
    s.setCurrent(project);
    s.setVersions(await window.desktop.listVersions({ projectId: id }));
    setText('');
    setAdvanced(false);
  };

  useEffect(() => {
    void refresh().catch((error) => useAppStore.getState().setError(String(error))).finally(() => setLoading(false));
    return window.desktop.onAgentEvent(({ projectId, event }) => {
      const store = useAppStore.getState();
      if (store.current?.id === projectId || !store.current) store.addEvent(event);
    });
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('buildflow-theme', theme);
  }, [theme]);


  const visibleEvents = useMemo(() => {
    const seen = new Set<string>();
    return s.events.filter((event): event is Exclude<AgentEvent, { type: 'raw' }> => {
      if (event.type === 'raw') return false;
      if (event.type === 'editing' && seen.has('editing')) return false;
      seen.add(event.type);
      return true;
    });
  }, [s.events]);
  const runningCount = s.projects.filter((project) => project.status === 'running').length;
  const latestEvent = visibleEvents.at(-1);
  const previewUrl = s.current?.status === 'running' && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(s.current.appUrl || '') ? s.current.appUrl : undefined;
  const frameWidth = previewMode === 'desktop' ? 820 : 390;
  const frameHeight = previewMode === 'desktop' ? 560 : 680;
  const frameScale = previewMode === 'desktop' ? Math.min(1, previewWidth / frameWidth) : 1;

  useEffect(() => { setPreviewLoaded(false); setPreviewVersion(0); }, [s.current?.id, previewUrl]);
  useEffect(() => {
    if (!previewUrl || !previewRef.current) return;
    const element = previewRef.current;
    const resize = () => setPreviewWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [previewUrl]);

  const act = async () => {
    const request = text.trim();
    if (!request || s.busy) return;
    if (request.length < (s.current ? 2 : 3)) { s.setError('원하는 내용을 조금 더 자세히 적어 주세요.'); return; }
    s.setBusy(true); s.setError();
    try {
      const project = s.current
        ? await window.desktop.modifyProject({ projectId: s.current.id, request })
        : await window.desktop.createProject({ description: request });
      s.setCurrent(project);
      s.setVersions(await window.desktop.listVersions({ projectId: project.id }));
      setText('');
      await refresh();
    } catch (error) {
      await refresh();
      s.setError(error instanceof Error ? error.message : String(error));
    } finally { s.setBusy(false); }
  };

  const retry = async () => {
    if (!s.current || s.busy) return;
    s.setBusy(true); s.setError();
    try {
      const project = await window.desktop.retryProject({ projectId: s.current.id });
      s.setCurrent(project);
      s.setVersions(await window.desktop.listVersions({ projectId: project.id }));
      await refresh();
    } catch (error) { s.setError(error instanceof Error ? error.message : String(error)); }
    finally { s.setBusy(false); }
  };

  const rollback = async (versionId: string) => {
    if (!s.current || s.busy) return;
    s.setBusy(true); s.setError();
    try {
      const project = await window.desktop.rollback({ projectId: s.current.id, versionId });
      s.setCurrent(project);
      s.setVersions(await window.desktop.listVersions({ projectId: project.id }));
      await refresh();
    } catch (error) { s.setError(error instanceof Error ? error.message : String(error)); }
    finally { s.setBusy(false); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><img src={brandIcon} alt=""/></span><span className="brand-name">buildflow<span className="brand-period">.</span></span></div>
      <div className="workspace-switch"><span className="workspace-avatar">BF</span><span><strong>Local workspace</strong><small>Private · On this device</small></span><Icon name="chevron" size={16}/></div>
      <div className="sidebar-label">WORKSPACE</div>
      <button type="button" className="nav-item active" onClick={() => s.setCurrent()}><Icon name="grid" size={18}/> 대시보드</button>
      <div className="sidebar-label project-label">PROJECTS <span>{s.projects.length}</span></div>
      <div className="sidebar-projects">
        {s.projects.map((project) => <button type="button" key={project.id} className={`sidebar-project ${s.current?.id === project.id ? 'active' : ''}`} onClick={() => void load(project.id)}><span className={`sidebar-project-dot status-${project.status}`}/><span>{project.name}</span></button>)}
      </div>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><Icon name="code" size={16}/></span><strong>Local-first runtime</strong><p>코드와 데이터는 이 컴퓨터에 저장됩니다.</p></div><div className="sidebar-footer">BUILDFLOW <span>v0.1.0</span></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">워크스페이스 <Icon name="chevron" size={14}/> <strong>{s.current?.name || '대시보드'}</strong></div><div className="topbar-actions"><div className="topbar-badge"><span/> 워크스페이스 활성</div><button type="button" className="theme-toggle" aria-label={`${theme === 'dark' ? '라이트' : '다크'} 모드로 전환`} title={`${theme === 'dark' ? '라이트' : '다크'} 모드`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15}/><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button></div></header>
      <div className={`content-wrap ${s.current ? 'project-mode' : ''}`}>
        <div className="page-intro"><div><div className="eyebrow">BUILDFLOW / WORKSPACE</div><h1>{s.current ? s.current.name : 'Build software with intent.'}</h1><p>{s.current ? '요청, 실행 상태, 버전을 한 곳에서 관리합니다.' : '요구사항을 설명하면 실행 가능한 로컬 앱으로 구현합니다.'}</p></div><button type="button" className="new-project-button" onClick={() => { s.setCurrent(); s.setVersions([]); setText(''); setAdvanced(false); }}><Icon name="plus" size={18}/> New project</button></div>

        {!s.current && <>
          <section className="hero-card"><div className="hero-copy"><div className="hero-kicker"><span className="signal-dot"/> LOCAL AI APPLICATION BUILDER</div><h2>From brief to working software.</h2><p>요구사항을 입력하세요. Buildflow가 코드를 작성하고 검증한 뒤 로컬에서 실행합니다.</p><button type="button" onClick={() => document.getElementById('project-prompt')?.focus()}>Create a project <Icon name="arrow" size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="terminal-window"><div className="terminal-bar"><span>buildflow / agent</span><i/><i/></div><code><b>01</b><span>Analyze product brief</span><em>done</em></code><code><b>02</b><span>Generate application</span><em>done</em></code><code className="active"><b>03</b><span>Validate and run</span><em>running</em></code></div></div></section>
          <div className="section-heading"><div><h2>Projects</h2><p>최근 작업과 실행 상태</p></div><span className="section-count">{s.projects.length} total · {runningCount} running</span></div>
          <section className="project-list">{loading ? <div className="empty-projects">프로젝트를 불러오는 중입니다…</div> : s.projects.length ? s.projects.map((project) => <ProjectCard key={project.id} project={project} selected={false} onClick={() => void load(project.id)}/>) : <div className="empty-projects"><span><Icon name="grid" size={24}/></span><strong>아직 프로젝트가 없어요</strong><p>아래에 첫 아이디어를 적어 시작해 보세요.</p></div>}</section>
        </>}

        {s.current && <section className="project-overview"><div className="overview-icon"><Icon name="grid" size={23}/></div><div className="overview-copy"><div className="overview-caption">PROJECT OVERVIEW</div><h2>{s.current.name}</h2><p>{s.current.description}</p><div className="overview-meta"><span><Icon name="clock" size={15}/> {dateLabel(s.current.updatedAt)}</span><span className={`status-pill status-${s.current.status}`}><span className="status-dot"/>{statusLabel(s.current)}</span></div></div><div className="overview-actions">{s.current.status === 'running' && <button type="button" className="outline-button" onClick={() => void window.desktop.openApp({ projectId: s.current!.id }).catch((error) => s.setError(String(error)))}>앱 열기 <Icon name="external" size={16}/></button>}{s.current.status === 'failed' && <button type="button" className="outline-button" disabled={s.busy} onClick={() => void retry()}><Icon name="refresh" size={16}/> 검증 다시 시도</button>}</div></section>}

        {previewUrl && <section className="preview-card" aria-label="실행 중인 앱 미리보기"><div className="preview-heading"><div className="preview-heading-icon"><Icon name="monitor" size={19}/></div><div><h2>실행 중인 앱</h2><p>프로젝트 화면을 여기서 바로 확인하고 사용할 수 있습니다.</p></div><div className="preview-actions"><div className="preview-modes" role="group" aria-label="미리보기 화면 크기"><button type="button" className={previewMode === 'desktop' ? 'active' : ''} title="데스크톱 화면" aria-label="데스크톱 화면" aria-pressed={previewMode === 'desktop'} onClick={() => { if (previewMode !== 'desktop') { setPreviewMode('desktop'); setPreviewLoaded(false); } }}><Icon name="monitor" size={15}/></button><button type="button" className={previewMode === 'mobile' ? 'active' : ''} title="모바일 화면" aria-label="모바일 화면" aria-pressed={previewMode === 'mobile'} onClick={() => { if (previewMode !== 'mobile') { setPreviewMode('mobile'); setPreviewLoaded(false); } }}><Icon name="phone" size={15}/></button></div><button type="button" title="미리보기 새로고침" aria-label="미리보기 새로고침" onClick={() => { setPreviewLoaded(false); setPreviewVersion((version) => version + 1); }}><Icon name="refresh" size={16}/></button><button type="button" title="새 창에서 열기" aria-label="새 창에서 열기" onClick={() => void window.desktop.openApp({ projectId: s.current!.id }).catch(() => s.setError('앱을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'))}><Icon name="external" size={16}/></button></div></div><div className="preview-browser"><div className="preview-browser-bar"><span className="browser-dots"><i/><i/><i/></span><span className="preview-address">{s.current!.name}</span><span className="preview-live"><i/> 실행 중</span></div><div ref={previewRef} className={`preview-viewport mode-${previewMode}`} style={{ height: frameHeight * frameScale + (previewMode === 'mobile' ? 28 : 0) }}>{!previewLoaded && <div className="preview-loading"><span className="preview-spinner"/>앱 화면을 불러오는 중…</div>}<iframe key={`${s.current!.id}-${previewVersion}-${previewMode}`} src={previewUrl} title={`${s.current!.name} 실행 화면`} style={{ width: frameWidth, height: frameHeight, left: Math.max(0, (previewWidth - frameWidth * frameScale) / 2), top: previewMode === 'mobile' ? 14 : 0, transform: `scale(${frameScale})` }} sandbox="allow-scripts allow-forms allow-same-origin allow-modals" referrerPolicy="no-referrer" onLoad={() => setPreviewLoaded(true)} onError={() => { setPreviewLoaded(true); s.setError('앱 미리보기를 불러오지 못했습니다.'); }}/></div></div></section>}

        <section className="composer-card"><div className="composer-heading"><span className="composer-icon"><Icon name="code" size={19}/></span><div><h2>{s.current ? 'Request a change' : 'Describe your product'}</h2><p>{s.current ? '수정할 내용과 기대 결과를 구체적으로 입력하세요.' : '핵심 사용자, 기능, 동작 방식을 입력하세요.'}</p></div></div><textarea id="project-prompt" value={text} onChange={(event) => setText(event.target.value)} disabled={s.busy} placeholder={s.current ? '예: 메시지 검색과 읽음 상태를 추가하고, 모바일 레이아웃을 개선해줘.' : '예: 가족별 계정, 실시간 메시지, 사진 공유 기능이 있는 비공개 가족 채팅 앱.'}/><div className="composer-footer"><span><Icon name="check" size={15}/> Changes are versioned locally</span><button type="button" className="primary-button" disabled={s.busy || !text.trim()} onClick={() => void act()}>{s.busy ? 'Building…' : s.current ? 'Apply changes' : 'Build project'} {!s.busy && <Icon name="arrow" size={17}/>}</button></div></section>

        {(s.busy || visibleEvents.length > 0) && <section className="activity-card"><div className="card-title"><span className="card-title-icon"><Icon name="clock" size={18}/></span><div><h2>작업 진행 상황</h2><p>{s.busy ? '단계별 진행 상태를 실시간으로 보여드립니다.' : latestEvent?.type === 'failed' ? '문제를 확인해 주세요.' : '최근 작업이 완료되었습니다.'}</p></div>{s.busy && <span className="live-badge"><i/> LIVE</span>}</div><div className="timeline">{visibleEvents.map((event: Exclude<AgentEvent, { type: 'raw' }>, index) => <div className={`timeline-item event-${event.type}`} key={`${event.type}-${index}`}><span className="timeline-marker">{event.type === 'completed' ? <Icon name="check" size={14}/> : event.type === 'failed' ? '!' : index + 1}</span><div><strong>{stageLabels[event.type]}</strong>{event.type === 'failed' && <p>{event.message}</p>}{event.type === 'completed' && <p>{event.summary}</p>}</div></div>)}</div>{s.events.some((event) => event.type === 'raw') && <div className="log-section"><button type="button" onClick={() => setAdvanced(!advanced)}><Icon name="code" size={15}/> 상세 로그 {advanced ? '접기' : '보기'}</button>{advanced && <pre>{s.events.filter((event) => event.type === 'raw').map((event) => event.type === 'raw' ? event.data : '').join('')}</pre>}</div>}</section>}

        {s.error && <div className="error-banner" role="alert"><strong>작업을 완료하지 못했습니다.</strong><span>{s.error}</span><button type="button" onClick={() => s.setError()} aria-label="오류 닫기">×</button></div>}

        {s.current && s.versions.length > 0 && <section className="versions-card"><div className="card-title"><span className="card-title-icon"><Icon name="clock" size={18}/></span><div><h2>버전 기록</h2><p>이전 작업 내역을 확인하고 되돌릴 수 있습니다.</p></div></div><div className="version-list">{s.versions.map((version, index) => <div className="version-row" key={version.id}><span className="version-marker"><Icon name="check" size={15}/></span><div><strong>{index === 0 ? '현재 버전' : `이전 버전 ${s.versions.length - index}`}</strong><p>{version.request}</p></div><time>{dateLabel(version.createdAt)}</time>{index > 0 && <button type="button" disabled={s.busy} onClick={() => void rollback(version.id)}>이 버전으로 복원</button>}</div>)}</div></section>}
      </div>
    </main>
  </div>;
}
