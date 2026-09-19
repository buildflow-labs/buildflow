import type { DesktopApi } from '../shared/contracts/ipc';
declare global { interface Window { desktop: DesktopApi } }
export {};
