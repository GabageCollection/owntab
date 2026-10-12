import { defineBackground } from 'wxt/utils/define-background';
import { handleRequest } from '../lib/bookmarks';
import type { Request } from '../lib/protocol';
import { registerBookmarkEvents } from '../lib/bookmarkEvents';
export default defineBackground(() => {
 chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.scope !== 'owntab') return;
  void handleRequest(message as Request,chrome.bookmarks).then(respond);
  return true;
 });
 registerBookmarkEvents(chrome.bookmarks, message => chrome.runtime.sendMessage(message));
});
