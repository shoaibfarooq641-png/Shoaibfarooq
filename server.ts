import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

let cachedAi: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your API key in the Settings > Secrets panel.'
    );
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  data?: string;
  textContent?: string;
  isText: boolean;
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: IncomingAttachment[];
}

interface ChatRequestBody {
  messages: IncomingMessage[];
  webSearch?: boolean;
  depth?: 'fast' | 'balanced' | 'deep';
}

function formatErrorMessage(err: unknown): string {
  const rawMsg = err instanceof Error ? err.message : String(err ?? '');
  console.warn('[Shoaib API]', rawMsg.slice(0, 300));
  if (err instanceof Error) {
    const msg = err.message || 'An unexpected error occurred.';
    if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      return 'Your Gemini API key appears invalid or lacks permission. Please verify it in the Settings > Secrets panel.';
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      return 'Free-tier API quota reached for now. You can add a billing-enabled API key in the Settings > Secrets panel to increase your quota, or retry shortly.';
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      return 'The AI service is momentarily busy due to high demand. Please retry in a few seconds.';
    }
    return msg;
  }
  return 'Failed to reach Shoaib AI service. Please try again.';
}

function extractDomain(uri: string): string {
  try {
    const url = new URL(uri);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return uri;
  }
}

interface WebContextResult {
  sources: Array<{ title: string; uri: string; domain: string }>;
  contextBlock: string;
  searchQuery: string;
}

const SEARCH_CACHE = new Map<string, { expiresAt: number; result: WebContextResult }>();
const TRIVIAL_GREETING_RE = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|bye|goodbye|good morning|good evening|good night)[!.\s]*$/i;

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

function extractBingTargetUrl(rawLink: string): string {
  const unescaped = decodeXmlEntities(rawLink);
  try {
    const parsed = new URL(unescaped);
    const target = parsed.searchParams.get('url');
    if (target && target.startsWith('http')) {
      return target;
    }
  } catch {
    // fallback to unescaped
  }
  return unescaped;
}

async function fetchWikipediaSource(
  query: string,
  signal: AbortSignal
): Promise<{
  sources: Array<{ title: string; uri: string; domain: string }>;
  snippets: string[];
}> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    query
  )}&gsrlimit=4&prop=extracts|info&exintro=1&explaintext=1&exchars=1200&inprop=url&format=json`;

  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'ShoaibAssistant/1.0' },
  });
  if (!res.ok) return { sources: [], snippets: [] };

  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; fullurl?: string; extract?: string; index?: number }
      >;
    };
  };

  const pages = Object.values(data.query?.pages ?? {})
    .filter((p) => p.title && p.fullurl && p.extract)
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

  return {
    sources: pages.map((p) => ({
      title: p.title!,
      uri: p.fullurl!,
      domain: extractDomain(p.fullurl!),
    })),
    snippets: pages.map(
      (p) => `[Wikipedia: ${p.title}] (${p.fullurl})\n${(p.extract ?? '').trim()}`
    ),
  };
}

async function fetchDuckDuckGoInstant(
  query: string,
  signal: AbortSignal
): Promise<{
  sources: Array<{ title: string; uri: string; domain: string }>;
  snippets: string[];
}> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&format=json&no_html=1&skip_disambig=1`;

  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'ShoaibAssistant/1.0' },
  });
  if (!res.ok) return { sources: [], snippets: [] };

  const data = (await res.json()) as {
    Heading?: string;
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Answer?: string;
    Infobox?: {
      content?: Array<{ label?: string; value?: unknown }>;
    };
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const sources: Array<{ title: string; uri: string; domain: string }> = [];
  const snippets: string[] = [];

  if (data.Answer) {
    snippets.push(`[Direct Answer] ${data.Answer}`);
  }

  if (data.AbstractText && data.AbstractURL) {
    sources.push({
      title: data.Heading || data.AbstractSource || extractDomain(data.AbstractURL),
      uri: data.AbstractURL,
      domain: extractDomain(data.AbstractURL),
    });
    snippets.push(
      `[Knowledge Summary: ${data.Heading || query}] (${data.AbstractURL})\n${data.AbstractText}`
    );
  }

  const infoboxFacts = (data.Infobox?.content ?? [])
    .filter((item) => item.label && typeof item.value === 'string' && item.value.trim())
    .slice(0, 10)
    .map((item) => `${item.label}: ${String(item.value).trim()}`);

  if (infoboxFacts.length > 0) {
    snippets.push(`[Key Facts]\n${infoboxFacts.join(' | ')}`);
  }

  const related = (data.RelatedTopics ?? [])
    .filter((t) => t.Text && t.FirstURL)
    .slice(0, 2);
  for (const r of related) {
    snippets.push(`[Related: ${r.Text}]`);
  }

  return { sources, snippets };
}

async function fetchBingNewsSource(
  query: string,
  signal: AbortSignal
): Promise<{
  sources: Array<{ title: string; uri: string; domain: string }>;
  snippets: string[];
}> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(
    query
  )}&format=rss`;

  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'ShoaibAssistant/1.0' },
  });
  if (!res.ok) return { sources: [], snippets: [] };

  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4);

  const sources: Array<{ title: string; uri: string; domain: string }> = [];
  const snippets: string[] = [];

  for (const match of items) {
    const block = match[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const rawLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1];
    const rawPub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];

    if (!rawTitle || !rawLink) continue;

    const title = decodeXmlEntities(rawTitle);
    const uri = extractBingTargetUrl(rawLink);
    const desc = rawDesc ? decodeXmlEntities(rawDesc) : '';
    const pubDate = rawPub ? decodeXmlEntities(rawPub) : '';

    if (!uri.startsWith('http')) continue;

    sources.push({
      title,
      uri,
      domain: extractDomain(uri),
    });

    snippets.push(
      `[News: ${title}${pubDate ? ` — ${pubDate}` : ''}] (${uri})\n${desc}`
    );
  }

  return { sources, snippets };
}

async function fetchLiveWebContext(query: string): Promise<WebContextResult> {
  const cleaned = query.replace(/[?!.]+$/g, '').trim().slice(0, 200);
  if (!cleaned || cleaned.length < 3 || TRIVIAL_GREETING_RE.test(cleaned)) {
    return { sources: [], contextBlock: '', searchQuery: '' };
  }

  const cacheKey = cleaned.toLowerCase();
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1450);

  try {
    const [wikiRes, ddgRes, newsRes] = await Promise.allSettled([
      fetchWikipediaSource(cleaned, controller.signal),
      fetchDuckDuckGoInstant(cleaned, controller.signal),
      fetchBingNewsSource(cleaned, controller.signal),
    ]);

    const seenUris = new Set<string>();
    const sources: Array<{ title: string; uri: string; domain: string }> = [];
    const snippets: string[] = [];

    for (const outcome of [ddgRes, wikiRes, newsRes]) {
      if (outcome.status !== 'fulfilled') continue;
      for (const s of outcome.value.sources) {
        if (!seenUris.has(s.uri)) {
          seenUris.add(s.uri);
          sources.push(s);
        }
      }
      snippets.push(...outcome.value.snippets);
    }

    const result: WebContextResult = {
      sources: sources.slice(0, 8),
      contextBlock: snippets.join('\n\n').slice(0, 8500),
      searchQuery: cleaned,
    };

    if (SEARCH_CACHE.size >= 100) {
      const oldestKey = SEARCH_CACHE.keys().next().value;
      if (oldestKey) SEARCH_CACHE.delete(oldestKey);
    }
    SEARCH_CACHE.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      result,
    });

    return result;
  } catch {
    return { sources: [], contextBlock: '', searchQuery: '' };
  } finally {
    clearTimeout(timer);
  }
}

let googleSearchBlockedUntil = 0;
let primaryModelBlockedUntil = 0;
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, assistant: 'Shoaib' });
  });

  // Google Play Trusted Web Activity (TWA / Bubblewrap) Digital Asset Links
  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    const packageName = process.env.TWA_PACKAGE_NAME?.trim() || 'com.shoaib.assistant';
    const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS || '')
      .split(',')
      .map((fp) => fp.trim())
      .filter(Boolean);

    res.setHeader('Content-Type', 'application/json');
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints:
            fingerprints.length > 0
              ? fingerprints
              : ['REPLACE_WITH_YOUR_PLAY_APP_SIGNING_SHA256_FINGERPRINT'],
        },
      },
    ]);
  });

  // Google Play Console Privacy Policy page
  app.get('/privacy', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy — Shoaib</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.65; color: #0f172a; }
      h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
      h2 { font-size: 1.15rem; margin-top: 1.75rem; }
      p, li { color: #334155; }
      a { color: #0d9488; }
    </style>
  </head>
  <body>
    <h1>Privacy Policy — Shoaib</h1>
    <p>Effective Date: ${new Date().toISOString().split('T')[0]}</p>
    <p>Shoaib is an AI-powered conversational assistant designed to provide accurate, search-grounded answers.</p>
    <h2>1. Information You Provide</h2>
    <p>Prompts, questions, and files you submit are transmitted securely over HTTPS to our backend server and processed via the Gemini API solely to generate your requested responses.</p>
    <h2>2. Local Conversation Storage</h2>
    <p>Your chat history and theme preferences are stored locally in your device browser storage. You can edit, delete individual chats, or clear all history at any time inside the app.</p>
    <h2>3. Live Web References</h2>
    <p>When Auto Search is enabled, search terms derived from your query may be sent to public reference providers (such as Google Search grounding, Wikipedia, DuckDuckGo Instant Answer, or Bing News) to retrieve up-to-date facts and source links.</p>
    <h2>4. Data Retention & Contact</h2>
    <p>We do not sell personal data or serve third-party advertising trackers. <a href="/">Return to Shoaib</a></p>
  </body>
</html>`);
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = req.body as ChatRequestBody;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required.' });
      return;
    }

    let ai: GoogleGenAI;
    try {
      ai = getAiClient();
    } catch (err) {
      res.status(500).json({ error: formatErrorMessage(err) });
      return;
    }

    const webSearch = body.webSearch !== false;
    const depth = body.depth ?? 'fast';

    const thinkingLevel =
      depth === 'fast'
        ? ThinkingLevel.LOW
        : depth === 'deep'
          ? ThinkingLevel.HIGH
          : ThinkingLevel.MEDIUM;

    const today = new Date().toISOString().split('T')[0];

    const systemInstruction = [
      'You are Shoaib, a fast, comprehensive, and highly accurate AI assistant—combining conversational intelligence with thorough Google-style knowledge coverage about anything and anyone.',
      `Current date: ${today}.`,
      'Guidelines for speed, completeness, and accuracy:',
      '- Start immediately with the direct, accurate answer in the first sentence without filler.',
      '- For questions about any person, place, organization, event, topic, or concept, provide rich, complete, well-organized information (key facts, dates, background, achievements, recent updates, and notable details) using clean Markdown headings, bullet lists, or tables.',
      '- For simple greetings or quick single-value calculations, reply concisely.',
      '- Use the live verified web, encyclopedia, and news references provided in context whenever present, and never fabricate citations, URLs, or facts.',
      '- Only mention your name (Shoaib) if the user asks who you are or what your name is.',
    ].join('\n');

    const contents: Content[] = body.messages
      .filter((m) => m.content.trim().length > 0 || (m.attachments && m.attachments.length > 0))
      .map((m) => {
        const parts: Part[] = [];

        if (m.attachments && m.attachments.length > 0) {
          for (const att of m.attachments) {
            if (att.isText && att.textContent !== undefined) {
              parts.push({
                text: `[Attached file: ${att.name}]\n\`\`\`\n${att.textContent.slice(0, 120000)}\n\`\`\``,
              });
            } else if (att.data && att.mimeType) {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: att.data,
                },
              });
            }
          }
        }

        if (m.content.trim().length > 0) {
          parts.push({ text: m.content });
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

    if (contents.length === 0) {
      res.status(400).json({ error: 'Cannot send an empty message.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string; domain: string }> = [];
      const querySet = new Set<string>();

      const runStream = async (
        streamContents: Content[],
        useNativeGoogleSearch: boolean,
        extraInstruction?: string
      ) => {
        const finalSystemInstruction = extraInstruction
          ? `${systemInstruction}\n\n${extraInstruction}`
          : systemInstruction;

        const attemptStream = async (modelToUse: string) => {
          const isFallbackModel = modelToUse !== MODEL_NAME;
          const stream = await ai.models.generateContentStream({
            model: modelToUse,
            contents: streamContents,
            config: {
              systemInstruction: finalSystemInstruction,
              ...(!isFallbackModel ? { thinkingConfig: { thinkingLevel } } : {}),
              ...(useNativeGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
            },
          });

          for await (const chunk of stream) {
            if (clientClosed) break;

            if (chunk.text) {
              sentAnyChunk = true;
              sendEvent({ type: 'chunk', text: chunk.text });
            }

            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata) {
              if (Array.isArray(groundingMetadata.webSearchQueries)) {
                for (const q of groundingMetadata.webSearchQueries) {
                  if (q && q.trim()) querySet.add(q.trim());
                }
              }
              if (Array.isArray(groundingMetadata.groundingChunks)) {
                for (const gc of groundingMetadata.groundingChunks) {
                  const uri = gc.web?.uri;
                  const title = gc.web?.title;
                  if (uri && !seenUris.has(uri)) {
                    seenUris.add(uri);
                    sources.push({
                      title: title?.trim() || extractDomain(uri),
                      uri,
                      domain: extractDomain(uri),
                    });
                  }
                }
              }
            }
          }
        };

        let sentAnyChunk = false;
        const primaryReady = Date.now() > primaryModelBlockedUntil;
        const modelsToTry = useNativeGoogleSearch
          ? primaryReady
            ? [MODEL_NAME]
            : [FALLBACK_MODEL]
          : primaryReady
            ? [MODEL_NAME, MODEL_NAME, FALLBACK_MODEL]
            : [FALLBACK_MODEL, FALLBACK_MODEL];

        for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
          const modelToUse = modelsToTry[attempt];
          try {
            await attemptStream(modelToUse);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            const isQuota = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
            const isTransient =
              msg.includes('503') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('500') ||
              msg.includes('high demand');

            if (isQuota && modelToUse === MODEL_NAME) {
              primaryModelBlockedUntil = Date.now() + 5 * 60_000;
            }

            if (sentAnyChunk || clientClosed || attempt === modelsToTry.length - 1) {
              throw err;
            }

            if (isQuota && !useNativeGoogleSearch) {
              // Jump straight to fallback model without waiting
              while (
                attempt + 1 < modelsToTry.length &&
                modelsToTry[attempt + 1] === MODEL_NAME
              ) {
                attempt++;
              }
              continue;
            }

            if (isTransient) {
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
              continue;
            }

            throw err;
          }
        }
      };

      let usedFallback = false;
      if (webSearch && Date.now() > googleSearchBlockedUntil && Date.now() > primaryModelBlockedUntil) {
        try {
          await runStream(contents, true);
        } catch (nativeErr) {
          const msg = nativeErr instanceof Error ? nativeErr.message : '';
          const shouldFallback =
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('429') ||
            msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('high demand');
          if (!shouldFallback) {
            throw nativeErr;
          }
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
            googleSearchBlockedUntil = Date.now() + 10 * 60_000;
          }
          usedFallback = true;
        }
      } else if (webSearch) {
        usedFallback = true;
      }

      if (!webSearch) {
        await runStream(contents, false);
      } else if (usedFallback && !clientClosed) {
        const lastUserMsg = [...body.messages]
          .reverse()
          .find((m) => m.role === 'user' && m.content.trim().length > 0);

        const webCtx = lastUserMsg
          ? await fetchLiveWebContext(lastUserMsg.content)
          : { sources: [], contextBlock: '', searchQuery: '' };

        for (const s of webCtx.sources) {
          if (!seenUris.has(s.uri)) {
            seenUris.add(s.uri);
            sources.push(s);
          }
        }
        if (webCtx.searchQuery) {
          querySet.add(webCtx.searchQuery);
        }

        const extraInstruction = webCtx.contextBlock
          ? `Use these live verified web reference excerpts when relevant to answer accurately:\n\n${webCtx.contextBlock}`
          : undefined;

        await runStream(contents, false, extraInstruction);
      }

      if (!clientClosed) {
        sendEvent({
          type: 'meta',
          sources,
          searchQueries: Array.from(querySet),
        });
        sendEvent({ type: 'done' });
        res.end();
      }
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      sendEvent({ type: 'error', error: errorMessage });
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/title', async (req: Request, res: Response) => {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length <= 44) {
      res.json({ title: trimmedPrompt.replace(/[.?!]+$/, '') });
      return;
    }

    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: `Create a concise 3 to 6 word title summarizing this user message. Return only the plain title text with no quotes, punctuation at the end, or prefixes:\n\n${trimmedPrompt.slice(0, 600)}`,
      });
      const raw = (response.text ?? '').trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '');
      res.json({ title: raw || trimmedPrompt.slice(0, 48) });
    } catch {
      res.json({ title: trimmedPrompt.slice(0, 48) });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Shoaib server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Shoaib server:', err);
  process.exit(1);
});
