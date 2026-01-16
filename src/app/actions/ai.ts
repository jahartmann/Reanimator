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
    markdown_report?: string; // New detailed report
};

export async function analyzeConfigWithAI(config: string, type: 'qemu' | 'lxc'): Promise<HealthResult> {
    const context = `
Du bist ein Proxmox Performance & Security Auditor.
Analysiere diese VM-Konfiguration (Type: ${type}) sehr detailliert.

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "score": number, // 0-100
  "summary": "string",
  "markdown_report": "string", // HIER: Ausführlicher Bericht in Markdown.
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "string",
      "description": "string",
      "fix": "string",
      "reasoning": "string"
    }
  ]
}

Anforderungen für 'markdown_report':
- Strukturiert (## Sektionen).
- Erkläre die Konfiguration (CPU, RAM, Disk Bus).
- Analysiere Performance-Flaschenhälse.
- Gib konkrete Handlungsempfehlungen.
- Sei kritisch aber konstruktiv.

Prüfe Best Practices: VirtIO, CPU Type 'host', Discard, Guest Agent.
Config:
${config}
    `.trim();

    const response = await generateAIResponse(context, '');
    const result = parseAIJSON(response);

    if (!result) {
        return { score: 100, issues: [], summary: 'KI-Parsing fehlgeschlagen (Ungültiges JSON)' };
    }
    return result;
}

export async function analyzeHostWithAI(files: { filename: string, content: string }[]): Promise<HealthResult> {
    const context = `
Du bist ein Linux System Engineer (Debian/Proxmox).
Analysiere diese System-Dumps auf Sicherheit, Performance und Stabilität.

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "score": number, 
  "summary": "string",
  "markdown_report": "string", // HIER: Ausführlicher Bericht in Markdown.
  "issues": [{ "severity": "...", "title": "...", "description": "...", "fix": "...", "reasoning": "..." }]
}

Anforderungen für 'markdown_report':
- Sektionen: System-Status, Netzwerk-Topologie, Storage-Health, Sicherheit.
- Erkläre Auffälligkeiten in den Logs/Configs.
- Gib konkrete Terminal-Befehle zur Behebung von Problemen.

Dateien:
${files.map(f => `=== ${f.filename} ===\n${f.content}\n`).join('\n')}
    `.trim();

    const response = await generateAIResponse(context, '');
    return parseAIJSON(response) || { score: 100, issues: [], summary: 'KI-Parsing fehlgeschlagen' };
}

export async function explainNetworkConfig(interfaces: any[]): Promise<string> {
    const context = `
Du bist ein erfahrener Netzwerk-Architect und Security-Consultant.
Analysiere die folgende Linux Netzwerk-Konfiguration (/etc/network/interfaces Struktur) detailliert.

Erstelle einen umfassenden Bericht in Markdown mit folgenden Sektionen:

### 1. 🗺️ Topologie-Überblick
- Erstelle eine Markdown-Tabelle für die Topologie (Spalten: Gerät, Typ, Physischer Port, Bridge/Bond, Hinweise).
- Visualisiere die Verbindungen klar.
- Identifiziere die Management-Schnittstelle und IP.

### 2. 🛡️ Sicherheits-Analyse
- Gibt es unsichere Konfigurationen? (z.B. Promiscuous Mode ungewollt, fehlende VLAN Trennung).
- Sind Kommentare vorhanden, die auf sensitive Infos hindeuten?

### 3. 🚀 Performance & Redundanz
- Wird Link Aggregation (LACP/Bonding) genutzt? Wenn nein, wo wäre es empfehlenswert?
- Sind MTU-Werte angepasst (Jumbo Frames)?
- Gibt es Flaschenhälse (z.B. 10G und 1G gemischt in Bond)?

### 4. 💡 Empfehlungen
- Konkrete Verbesserungsvorschläge (Best Practices für Proxmox/Debian).
- Wenn die Config gut ist, bestätige dies explizit.

Antworte strukturiert, fachlich korrekt aber verständlich. Nutze Icons zur Visualisierung.
    `.trim();

    return generateAIResponse(`Hier die Config:\n${JSON.stringify(interfaces, null, 2)}`, context);
}
