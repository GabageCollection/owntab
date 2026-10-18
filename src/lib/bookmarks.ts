import { z } from 'zod';
import { findNode, messageError, rootsOf, titleSchema, urlSchema, type Node } from './model';
import type { Reply, Request } from './protocol';
const id = z.string().min(1);
const schema = z.discriminatedUnion('action', [
 z.object({action:z.literal('tree')}), z.object({action:z.literal('children'),id}),
 z.object({action:z.literal('create'),parentId:id,title:titleSchema,url:urlSchema.optional()}),
 z.object({action:z.literal('update'),id,title:titleSchema,url:urlSchema.optional()}),
 z.object({action:z.literal('move'),id,parentId:id,index:z.number().int().min(0).max(10000).optional()}), z.object({action:z.literal('remove'),id})
]);
export async function handleRequest(raw: Request, api: typeof chrome.bookmarks): Promise<Reply> {
 try {
  const r = schema.parse(raw);
  if (r.action === 'tree') return {ok:true,data:await api.getTree()};
  if (r.action === 'children') return {ok:true,data:await api.getChildren(r.id)};
  const tree = await api.getTree();
  const roots = rootsOf(tree);
  function folder(folderId: string): Node { const n = findNode(tree,folderId); if (!n || n.url || n.id === '0' || n.unmodifiable) throw new Error('目标文件夹不存在或不可编辑'); return n; }
  if (r.action === 'create') { folder(r.parentId); return {ok:true,data:await api.create({parentId:r.parentId,title:r.title,...(r.url ? {url:r.url} : {})})}; }
  const node = findNode(tree,r.id);
  if (!node || node.id === '0' || roots.some(n => n.id === node.id) || node.unmodifiable) throw new Error('此书签不存在或不可编辑');
  if (r.action === 'update') {
   if (!node.url && r.url !== undefined) throw new Error('文件夹不能修改网址');
   return {ok:true,data:await api.update(r.id,{title:r.title,...(node.url && r.url ? {url:r.url} : {})})};
  }
  if (r.action === 'move') {
   folder(r.parentId);
   if (findNode([node],r.parentId)) throw new Error('不能移动到自身或子文件夹中');
   return {ok:true,data:await api.move(r.id,{parentId:r.parentId,...(r.index !== undefined ? {index:r.index} : {})})};
  }
  if (node.url) await api.remove(r.id); else await api.removeTree(r.id);
  return {ok:true,data:null};
 } catch(e) { return {ok:false,error:messageError(e)}; }
}
