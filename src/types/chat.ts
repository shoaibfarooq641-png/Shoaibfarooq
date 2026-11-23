export type ReasoningDepth = 'fast' | 'balanced' | 'deep';

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Base64 string without data URL prefix for binary/image files */
  data?: string;
  /** Preview data URL for images */
  previewUrl?: string;
  /** Plain text content for code/text files */
  textContent?: string;
  isText: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
  domain: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  sources?: GroundingSource[];
  searchQueries?: string[];
  webSearchUsed?: boolean;
  depth?: ReasoningDepth;
  error?: string;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
