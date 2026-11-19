import { defineBackground } from 'wxt/utils/define-background';
import { handleRequest } from '../lib/bookmarks';
import type { Request } from '../lib/protocol';
import { registerBookmarkEvents } from '../lib/bookmarkEvents';
import { createLocalDataHandler } from '../lib/localData';
import { handleBatch } from '../lib/batch';
export default defineBackground(() => {
 let importing = false;
 const handleLocal = createLocalDataHandler(chrome.storage.local, chrome.bookmarks, () => importing);
 chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.scope === 'owntab-local') {
   void handleLocal(message.operation).then(respond);
   return true;
  }
  if (message?.scope === 'owntab-batch') {
   void handleBatch(message.operation, chrome.bookmarks, () => importing).then(respond);
   return true;
  }
  if (message?.scope !== 'owntab') return;
  void handleRequest(message as Request,chrome.bookmarks).then(respond);
  return true;
 });
 registerBookmarkEvents(chrome.bookmarks, message => {
  if (message.importing !== undefined) importing = message.importing;
  return chrome.runtime.sendMessage(message);
 });
});
