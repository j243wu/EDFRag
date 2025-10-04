import type { Message } from './types';

const CHATS_KEY = 'rag-chats-index';

export function createChatIfMissing(id: string) {
  const index = getAllChats();
  if (!index.find(x => x.id === id)) {
    index.unshift({ id, createdAt: Date.now() });
    localStorage.setItem(CHATS_KEY, JSON.stringify(index));
    localStorage.setItem(messagesKey(id), JSON.stringify([]));
  }
}

export function getAllChats(): { id: string; createdAt: number }[] {
  const raw = localStorage.getItem(CHATS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function messagesKey(id: string) { return `rag-chat:${id}:messages`; }

export function getMessages(id: string): Message[] {
  const raw = localStorage.getItem(messagesKey(id));
  return raw ? JSON.parse(raw) : [];
}

export function persistMessage(id: string, msg: Message) {
  const cur = getMessages(id);
  cur.push(msg);
  localStorage.setItem(messagesKey(id), JSON.stringify(cur));
}

const ACTIVE_KEY = 'rag-active-session-id';
export function getActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}
export function setActiveSessionId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}
