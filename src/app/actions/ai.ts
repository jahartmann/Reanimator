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

export async function suggestTagsWithAI(vmNames: string[]): Promise<Record<string, string[]>> {
    const context = `
Du bist ein Ordnungsliebender Admin.
Analysiere die VM-Namen.
Erstelle sinnvolle Tags (Kategorien) basierend auf dem Namen.
Beispiele:
- "db-prod-01" -> ["Datenbank", "Production", "SQL"]
- "win2019-dc" -> ["Windows", "Domain Controller"]
- "nextcloud" -> ["Webservice", "Cloud"]
- "pve-test" -> ["Testing"]

Antworte NUR mit reinem JSON. Format: {"vmName": ["Tag1", "Tag2"]}.
Kein Markdown, kein Text davor/danach.
    `.trim();

    const prompt = `VM Liste:\n${vmNames.join('\n')}`;

    try {
        const response = await generateAIResponse(prompt, context);
        // Sanitize JSON response (remove markdown code blocks if Ollama adds them)
        const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Tag AI Error:', e);
        return {};
    }
}

export async function analyzeConfigWithAI(config: string, type: 'qemu' | 'lxc'): Promise<string> {
    const context = `
Du bist ein Proxmox Performance Experte.
Analysiere die Konfiguration auf Best Practices und Performance-Probleme.
Fokus:
- Disk Controller (VirtIO SCSI Single ist bevorzugt)
- Network Model (VirtIO ist bevorzugt)
- CPU Type (Host ist meistens besser als kvm64)
- SSD/Discard Flag bei Disks
- Memory Ballooning Einstellungen

Antworte strukturiert in Markdown mit Emojis.
Wenn alles gut ist, antworte nur mit "✅ Konfiguration sieht solide aus.".
Fasse dich kurz.
    `.trim();

    return generateAIResponse(`Type: ${type}\nConfig:\n${config}`, context);
}
