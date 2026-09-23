// Speech-to-text for WhatsApp voice notes.
//
// Many customers in Kinshasa dictate rather than type. When a transcription
// provider is configured the note becomes text and goes through the usual
// understanding path; without one the bot keeps asking politely for buttons.
//
// Two providers are supported, both plain HTTP with an API key:
//   STT_PROVIDER=openai    OpenAI (or any Whisper-compatible endpoint)
//   STT_PROVIDER=deepgram  Deepgram
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const MAX_BYTES = 12 * 1024 * 1024; // WhatsApp caps voice notes well below this
const TIMEOUT_MS = 20_000;

export const isEnabled = () => Boolean(config.stt.provider && config.stt.apiKey);

/**
 * Returns the spoken text, or null when transcription is off or fails.
 * Never throws: a failed transcription must not lose the customer's message.
 */
export async function transcribe(buffer, contentType = 'audio/ogg') {
  if (!isEnabled() || !buffer?.length || buffer.length > MAX_BYTES) return null;
  try {
    const text = config.stt.provider === 'deepgram'
      ? await viaDeepgram(buffer, contentType)
      : await viaOpenAI(buffer, contentType);
    const clean = String(text || '').trim();
    return clean.length >= 2 ? clean.slice(0, 900) : null;
  } catch (err) {
    logger.warn('Transcription failed:', err.message);
    return null;
  }
}

async function viaOpenAI(buffer, contentType) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), 'voice.ogg');
  form.append('model', config.stt.model || 'whisper-1');
  if (config.stt.language) form.append('language', config.stt.language);
  const res = await fetch(`${config.stt.baseUrl || 'https://api.openai.com/v1'}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.stt.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).text;
}

async function viaDeepgram(buffer, contentType) {
  const params = new URLSearchParams({ model: config.stt.model || 'nova-2', smart_format: 'true' });
  if (config.stt.language) params.set('language', config.stt.language);
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${config.stt.apiKey}`, 'Content-Type': contentType },
    body: buffer,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
}
