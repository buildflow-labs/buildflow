import { create } from 'zustand';
import type { Project, Version } from '../../shared/models/project';
import type { AgentEvent } from '../../shared/events/agent-event';

type State = {
  projects: Project[]; current?: Project; versions: Version[]; events: AgentEvent[]; busy: boolean; error?: string;
  setProjects(projects: Project[]): void; setCurrent(project?: Project): void; setVersions(versions: Version[]): void;
  addEvent(event: AgentEvent): void; setBusy(busy: boolean): void; setError(error?: string): void;
};
export const useAppStore = create<State>((set) => ({
  projects: [], versions: [], events: [], busy: false,
  setProjects: (projects) => set({ projects }), setCurrent: (current) => set({ current, events: [], error: undefined }),
  setVersions: (versions) => set({ versions }), addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  setBusy: (busy) => set({ busy }), setError: (error) => set({ error }),
}));
