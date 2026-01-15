'use server';

import db from '@/lib/db';
import { request } from 'undici';

// --- Settings Management ---

export async function getAISettings() {
    const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_url') as { value: string } | undefined;
    const model = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_model') as { value: string } | undefined;
    return {
        url: url?.value || 'http://localhost:11434',
        model: model?.value || ''
    };
}

export async function saveAISettings(url: string, model: string) {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    upsert.run('ai_url', url);
    upsert.run('ai_model', model);
    return { success: true };
}

// --- Ollama API Proxy ---

export interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    modified_at: string;
}

export async function checkOllamaConnection(url: string) {
    try {
        // Remove trailing slash
        const cleanUrl = url.replace(/\/$/, '');
        const res = await request(`${cleanUrl}/api/tags`);

        if (res.statusCode !== 200) {
            return { success: false, message: `Status ${res.statusCode}` };
        }

        const data = await res.body.json() as { models: OllamaModel[] };
        return { success: true, models: data.models };
    } catch (e: any) {
        return { success: false, message: e.message || 'Connection failed' };
    }
}

export async function generateAIResponse(prompt: string, systemContext?: string): Promise<string> {
    const settings = await getAISettings();
    if (!settings.model) throw new Error('Kein AI Model ausgewählt. Bitte in den Einstellungen konfigurieren.');

    try {
        const cleanUrl = settings.url.replace(/\/$/, '');

        const payload = {
            model: settings.model,
            prompt: prompt,
            system: systemContext || "Du bist ein hilfreicher Systemadministrator-Assistent für Proxhost.",
            stream: false,
            options: {
                temperature: 0.3 // Low temperature for factual admin tasks
            }
        };

        const res = await request(`${cleanUrl}/api/generate`, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.statusCode !== 200) {
            throw new Error(`Ollama Error: ${res.statusCode}`);
        }

        const data = await res.body.json() as { response: string };
        return data.response;

    } catch (e: any) {
        console.error('AI Generation Error:', e);
        throw new Error(`AI Fehler: ${e.message}`);
    }
}

// --- Specific Features ---

export async function analyzeLogWithAI(logContent: string): Promise<string> {
    // Truncate log if too long (Ollama context limits)
    const truncatedLog = logContent.length > 8000 ? logContent.slice(-8000) : logContent;

    const context = `
Du bist ein Linux/Proxmox Experte. 
Analysiere den folgenden Log-Auszug eines fehlgeschlagenen Tasks (Migration oder Backup).
Identifiziere das Kernproblem.
Antworte kurz und prägnant (max 2 Sätze) in Deutsch.
Gib dem User eine konkrete Handlungsanweisung.
Ignoriere den Stacktrace, fokussiere dich auf die Fehlermeldung.
    `.trim();

    return generateAIResponse(`Hier ist der Log:\n\n${truncatedLog}`, context);
}

// Helper to separate JSON from text
function parseAIJSON(response: string) {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('AI JSON Parse Error:', e);
        return null;
    }
}

export async function suggestTagsWithAI(vmNames: string[]): Promise<Record<string, string[]>> {
    const context = `
Analyze the following VM names and suggest 1-3 broad, industry-standard categories (tags) for each.
Context: Proxmox Virtualization Environment.
Rules:
- Tags should be lowercase, single words (e.g., "database", "web", "windows", "cache", "proxy").
- Avoid generic tags like "vm" or "server".
- Format: JSON Object where key is VM Name and value is Array of strings.

Names:
${vmNames.join('\n')}
    `.trim();

    const response = await generateAIResponse('Tag these VMs', context);
    return parseAIJSON(response) || {};
}

export type HealthIssue = {
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    fix?: string;
};

export type HealthResult = {
    score: number; // 0-100
    issues: HealthIssue[];
    summary: string;
};

export async function analyzeConfigWithAI(config: string, type: 'qemu' | 'lxc'): Promise<HealthResult> {
    const context = `
You are a Proxmox Performance & Security Auditor.
Analyze this VM configuration.
Output STRICT JSON exactly corresponding to this TypeScript interface:
{
  score: number; // 0-100, 100 is perfect
  summary: string; // 1 sentence overview
  issues: [
    {
      severity: "critical" | "warning" | "info",
      title: string,
      description: string, // concise reason
      fix: string // command or setting to change
    }
  ]
}

Check for:
- VirtIO usage (Net/Disk) -> Warning if not
- CPU Type (prefer 'host') -> Warning if kvm64
- Discard/SSD Emulation -> Info/Warning
- Network Bridges -> Check for validity
    `.trim();

    const response = await generateAIResponse(`Type: ${type}\nConfig:\n${config}`, context);
    const result = parseAIJSON(response);

    // Fallback if AI fails
    if (!result) {
        return { score: 100, issues: [], summary: 'AI Parse Error' };
    }
    return result;
}

export async function analyzeHostWithAI(files: { filename: string, content: string }[]): Promise<HealthResult> {
    const context = `
You are a Linux Systems Engineer auditing a Proxmox Host.
Analyze the provided configuration files for security, performance, and stability issues.

Files provided:
${files.map(f => `- ${f.filename}`).join('\n')}

Output STRICT JSON (same format as before):
{
  score: number,
  summary: string,
  issues: [{ severity, title, description, fix }]
}

Checks:
- /etc/network/interfaces: Redundancy (Bonding)? Empty Bridges?
- storage.cfg: Unsafe mounts?
- sysctl: Swappiness? Forwarding enabled?
    `.trim();

    const fileContentStr = files.map(f => `=== ${f.filename} ===\n${f.content}\n`).join('\n');

    const response = await generateAIResponse(fileContentStr, context);
    return parseAIJSON(response) || { score: 100, issues: [], summary: 'AI Parse Error' };
}
