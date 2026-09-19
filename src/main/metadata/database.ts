import { DatabaseSync } from 'node:sqlite';
import type { Version } from '../../shared/models/project.js';

export class MetadataDatabase {
  private db: DatabaseSync;
  constructor(path: string) { this.db = new DatabaseSync(path); this.db.exec('CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, commit_hash TEXT NOT NULL, request TEXT NOT NULL, created_at TEXT NOT NULL)'); }
  add(v: Version) { this.db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?, ?)').run(v.id, v.projectId, v.commitHash, v.request, v.createdAt); }
  list(projectId: string): Version[] { return (this.db.prepare('SELECT id, project_id projectId, commit_hash commitHash, request, created_at createdAt FROM versions WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as unknown) as Version[]; }
  get(id: string) { return this.db.prepare('SELECT id, project_id projectId, commit_hash commitHash, request, created_at createdAt FROM versions WHERE id = ?').get(id) as unknown as Version | undefined; }
  close() { this.db.close(); }
}
