import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopApi } from '../shared/contracts/ipc.js';
import type { AgentEvent } from '../shared/events/agent-event.js';
const api: DesktopApi = {
  listProjects: () => ipcRenderer.invoke(IPC.listProjects), createProject: (v) => ipcRenderer.invoke(IPC.createProject, v), modifyProject: (v) => ipcRenderer.invoke(IPC.modifyProject, v), retryProject: (v) => ipcRenderer.invoke(IPC.retryProject, v), deleteProject: (v) => ipcRenderer.invoke(IPC.deleteProject, v), listVersions: (v) => ipcRenderer.invoke(IPC.listVersions, v), rollback: (v) => ipcRenderer.invoke(IPC.rollback, v), openApp: (v) => ipcRenderer.invoke(IPC.openApp, v), checkAgent: () => ipcRenderer.invoke(IPC.checkAgent),
  onAgentEvent: (listener) => { const fn = (_: Electron.IpcRendererEvent, payload: { projectId: string; event: AgentEvent }) => listener(payload); ipcRenderer.on(IPC.event, fn); return () => ipcRenderer.removeListener(IPC.event, fn); },
};
contextBridge.exposeInMainWorld('desktop', api);
