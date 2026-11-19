import type { Node } from './model';
import { messageError } from './model';
import type { BackupSnapshot } from './backup';
import type { LocalOperation, LocalReply, RestoreResult } from './localData';
import type { BatchOperation, BatchReply, BatchResult } from './batch';
export type Request = { scope: 'owntab'; action: 'tree' } | { scope: 'owntab'; action: 'children'; id: string } | { scope: 'owntab'; action: 'create'; parentId: string; title: string; url?: string } | { scope: 'owntab'; action: 'update'; id: string; title: string; url?: string } | { scope: 'owntab'; action: 'move'; id: string; parentId: string; index?: number } | { scope: 'owntab'; action: 'remove'; id: string };
export type Reply = { ok: true; data: Node | Node[] | null } | { ok: false; error: string };
export interface Changed { scope: 'owntab-changed'; parentIds: string[]; all: boolean; importing?: boolean }
export async function request(input: Request): Promise<Node | Node[] | null> { try { const reply: Reply = await chrome.runtime.sendMessage(input); if (!reply?.ok) throw new Error(reply?.error ?? '后台暂时不可用，请重试'); return reply.data; } catch(e) { throw new Error(messageError(e)); } }
type LocalResponse<T extends LocalOperation> = T extends { action: 'snapshot' } ? BackupSnapshot : T extends { action: 'restore' } ? RestoreResult : T extends { action: 'batchTags' } ? BatchResult : null;
export async function requestLocal<T extends LocalOperation>(operation: T): Promise<LocalResponse<T>> {
 const reply: LocalReply = await chrome.runtime.sendMessage({ scope: 'owntab-local', operation });
 if (!reply?.ok) throw new Error(reply?.error ?? '后台暂时不可用，请重试');
 return reply.data as LocalResponse<T>;
}
export async function requestBatch(operation: BatchOperation): Promise<BatchResult> {
 const reply: BatchReply = await chrome.runtime.sendMessage({ scope: 'owntab-batch', operation });
 if (!reply?.ok) throw new Error(reply?.error ?? '后台暂时不可用，请重试');
 return reply.data;
}
