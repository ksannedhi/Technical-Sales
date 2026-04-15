import fetch from 'node-fetch';
import {
  CHANGE_TRACKER_SYSTEM,
  buildChangeTrackerPrompt,
  buildChangeTrackerDescriptionPrompt
} from './prompt.js';

const CLAUDE_MODEL = 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function parseClaudeJSON(text) {
  let match = text.match(/<r>([\s\S]*?)<\/r>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/<result>([\s\S]*?)<\/result>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return JSON.parse(match[1].trim());
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    try { return JSON.parse(text.slice(jsonStart)); } catch { /* fall through */ }
  }
  throw new Error('No parseable JSON found in Claude response');
}

async function callClaude(system, userMessage) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return data.content[0]?.text || '';
}

export async function analyseDocumentChange(oldText, newText, frameworkName) {
  const prompt = buildChangeTrackerPrompt(oldText, newText, frameworkName);
  const raw = await callClaude(CHANGE_TRACKER_SYSTEM, prompt);
  return parseClaudeJSON(raw);
}

export async function analyseDescribedChange(description, frameworkName) {
  const prompt = buildChangeTrackerDescriptionPrompt(description, frameworkName);
  const raw = await callClaude(CHANGE_TRACKER_SYSTEM, prompt);
  return parseClaudeJSON(raw);
}
