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
Analysiere diese VM-Konfiguration (Type: ${type}).

Antworte AUSSCHLIESSLICH mit validem JSON (kein Markdown, kein Text davor/danach):
{
  "score": number, // 0-100 (100 = Perfekt)
  "summary": "string", // Kurze deutsche Zusammenfassung
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "string", // DEUTSCH
      "description": "string", // DEUTSCH, präzise
      "fix": "string", // Konkreter Befehl oder Einstellung
      "reasoning": "string" // WARUM ist das ein Problem? (Erklärung)
    }
  ]
}

Prüfe streng auf Best Practices:
1. VirtIO: Wir wollen 'virtio' für Net & Disk (scsi mit virtio-scsi).
2. CPU: Type sollte 'host' sein (beste Performance), außer es gibt Migrationsgründe (kvm64 ist fallback -> Warnung).
3. Discard: SSD Emulation / Discard sollte aktiv sein.
4. Agent: Qemu-Guest-Agent sollte installiert/aktiv sein.

Config:
${config}
    `.trim();

    const response = await generateAIResponse(context, ''); // Prompt is in context mainly
    const result = parseAIJSON(response);

    // Fallback if AI fails
    if (!result) {
        return { score: 100, issues: [], summary: 'KI-Parsing fehlgeschlagen (Ungültiges JSON)' };
    }
    return result;
}

export async function analyzeHostWithAI(files: { filename: string, content: string }[]): Promise<HealthResult> {
    const context = `
Du bist ein Linux System Engineer (Debian/Proxmox).
Analysiere diese System-Dumps auf Sicherheit und Performance.

Antworte AUSSCHLIESSLICH mit validem JSON (Deutsch):
{
  "score": number, // 0-100
  "summary": "string",
  "issues": [{ "severity": "...", "title": "...", "description": "...", "fix": "...", "reasoning": "..." }]
}

Checks:
1. **User Check**: Prüfe /etc/passwd oder shadow (falls vorhanden) ob NUR 'root' genutzt wird. -> WARNUNG: "Nur Root-User aktiv". Empfehle separaten Admin-User/Sudo.
2. Network: Redundanz vorhanden (LACP/Bond)? Leere Bridges?
3. Storage: 'dir' Storage auf Root-Disk? (Warnung).
4. Sysctl: Swappiness optimiert? (vm.swappiness < 60 für Server empfohlen).

Dateien:
${files.map(f => `=== ${f.filename} ===\n${f.content}\n`).join('\n')}
    `.trim();

    const response = await generateAIResponse(context, '');
    return parseAIJSON(response) || { score: 100, issues: [], summary: 'KI-Parsing fehlgeschlagen' };
}

export async function explainNetworkConfig(interfaces: any[]): Promise<string> {
    const context = `
Du bist ein Netzwerk-Experte.
Erkläre einem Junior-Admin den folgenden Netzwerk-Aufbau verständlich auf Deutsch.
Fasse zusammen:
- Welche Bridges gibt es und was verbinden sie? (VMs, Physische Ports)
- Gibt es Redundanz (Bonds)?
- Was ist die Management-IP?

Antworte direkt mit der Erklärung in Markdown/Text. Keine JSON-Struktur nötig, einfach ein guter Text.
    `.trim();

    return generateAIResponse(`Hier die Config:\n${JSON.stringify(interfaces, null, 2)}`, context);
}
