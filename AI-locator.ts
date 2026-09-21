import type { Page } from '@playwright/test';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
  'tab', 'menuitem', 'cell', 'option', 'searchbox', 'switch',
]);

interface PageElement {
  role: string;
  name: string;
}

interface ResolvedAction {
  role: string;
  name: string;
  action: 'click' | 'fill' | 'selectOption' | 'check' | 'uncheck';
  value?: string;
  reasoning?: string;
  error?: string;
}

async function collectInteractiveElements(page: Page): Promise<PageElement[]> {
  const snapshotText: string = await page.locator('body').ariaSnapshot();

  const elements: PageElement[] = [];
  const pattern = /\b([a-z]+)\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(snapshotText)) !== null) {
    const [, role, name] = match;
    if (INTERACTIVE_ROLES.has(role)) {
      elements.push({ role, name });
    }
  }

  const seen = new Set<string>();
  return elements.filter((e) => {
    const key = `${e.role}::${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function askClaudeToResolve(instruction: string, elements: PageElement[]): Promise<ResolvedAction> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in .env');
  }

  const systemPrompt = `You resolve a plain-English test step into a specific element on a web page.
You are given:
1. An instruction describing what to do.
2. A list of interactive elements currently visible on the page (role + accessible name only).

Pick the single best matching element and the action to perform on it.
Respond ONLY with JSON, no other text, in exactly this shape:
{"role": "<one of the given roles>", "name": "<exact name from the list>", "action": "click|fill|selectOption|check|uncheck", "reasoning": "<one short sentence>"}

Omit "value" — the caller supplies real values separately, never you.
If nothing in the list plausibly matches, respond with:
{"error": "no match found"}`;

  const userPrompt = `Instruction: "${instruction}"

Available elements on the page:
${elements.map((e) => `- role: ${e.role}, name: "${e.name}"`).join('\n')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${JSON.stringify(data)}`);
  }

  const text = (data.content || []).map((b: any) => b.text || '').join('').trim();
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Could not parse AI response as JSON: ${text}`);
  }

  if (parsed.error) {
    throw new Error(`AI could not resolve instruction "${instruction}": ${parsed.error}`);
  }

  return parsed as ResolvedAction;
}

// ===========================
// Public API: resolve + perform the action
// ===========================
export async function resolveAndAct(page: Page, instruction: string, valueOverride?: string) {
  const elements = await collectInteractiveElements(page);
  const resolved = await askClaudeToResolve(instruction, elements);

  console.log(
    `AI resolved "${instruction}" -> role=${resolved.role}, name="${resolved.name}", action=${resolved.action}` +
    (resolved.reasoning ? ` (${resolved.reasoning})` : '')
  );

  const locator = page.getByRole(resolved.role as any, { name: resolved.name, exact: false });

  switch (resolved.action) {
    case 'click':
      await locator.click();
      break;
    case 'fill':
      if (valueOverride === undefined) {
        throw new Error(`Action "fill" needs a valueOverride for instruction "${instruction}"`);
      }
      await locator.fill(valueOverride);
      break;
    case 'selectOption':
      if (valueOverride === undefined) {
        throw new Error(`Action "selectOption" needs a valueOverride for instruction "${instruction}"`);
      }
      // Match by visible label text first (what the AI actually sees on the
      // page), falling back to raw value in case it's a custom dropdown
      // component where selectOption expects the option's value instead.
      try {
        await locator.selectOption({ label: valueOverride });
      } catch {
        await locator.selectOption(valueOverride);
      }
      break;
    case 'check':
      await locator.check();
      break;
    case 'uncheck':
      await locator.uncheck();
      break;
    default:
      throw new Error(`Unknown action "${resolved.action}" for instruction "${instruction}"`);
  }

  return resolved;
}