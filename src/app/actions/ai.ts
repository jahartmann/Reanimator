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
Du bist ein Proxmox Performance & Security Auditor.
Analysiere diese VM-Konfiguration.
Antworte AUSSCHLIESSLICH mit validem JSON (kein Markdown), passend zu diesem Interface:
{
  "score": number, // 0-100, 100 ist perfekt
  "summary": "string", // 1 Satz Zusammenfassung auf DEUTSCH
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "string", // DEUTSCH
      "description": "string", // DEUTSCH, präzise
      "fix": "string" // Befehl oder Einstellung
    }
  ]
}

Prüfe auf:
- VirtIO Nutzung (Net/Disk) -> Warnung wenn nicht
- CPU Type (prefer 'host') -> Warnung wenn kvm64
- Discard/SSD Emulation -> Info/Warnung
- Network Bridges -> Plausibilität
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
Du bist ein Linux System Engineer, der einen Proxmox Host auditiert.
Analysiere die Konfigurationsdateien auf Sicherheit, Performance und Stabilität.

Dateien:
${files.map(f => `- ${f.filename}`).join('\n')}

Antworte AUSSCHLIESSLICH mit validem JSON (gleiches Format wie oben):
{
  "score": number,
  "summary": "string", // DEUTSCH
  "issues": [{ "severity": "...", "title": "...", "description": "...", "fix": "..." }]
}

Checks:
- /etc/network/interfaces: Redundanz (Bonding)? Leere Bridges?
- storage.cfg: Unsichere Mounts?
- sysctl: Swappiness? Forwarding aktiv?
    `.trim();

    const fileContentStr = files.map(f => `=== ${f.filename} ===\n${f.content}\n`).join('\n');

    const response = await generateAIResponse(fileContentStr, context);
    return parseAIJSON(response) || { score: 100, issues: [], summary: 'AI Parse Error' };
}
