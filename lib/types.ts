export type Source = { title?: string; url: string };
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  sources?: Source[];
};

export type RagResponse = {
  text: string;
  sources: Source[];
};
