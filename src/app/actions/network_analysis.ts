'use server';

import db from '@/lib/db';
import { getNetworkConfig } from './network';
import { explainNetworkConfig } from './ai';

export interface AnalysisResult {
    id: number;
    server_id: number;
    type: 'network';
    content: string;
    created_at: string;
}

export async function getLatestNetworkAnalysis(serverId: number): Promise<AnalysisResult | null> {
    const row = db.prepare(`
        SELECT * FROM server_ai_analysis 
        WHERE server_id = ? AND type = 'network' 
        ORDER BY created_at DESC LIMIT 1
    `).get(serverId) as any;

    if (!row) return null;
    return row as AnalysisResult;
}

export async function runNetworkAnalysis(serverId: number) {
    console.log(`[AI Analysis] Starting Network Analysis for Server ${serverId}...`);

    // 1. Fetch Config
    const config = await getNetworkConfig(serverId);
    if (!config.success || !config.interfaces) {
        throw new Error(`Failed to fetch network config: ${config.error}`);
    }

    // 2. AI Analysis
    const explanation = await explainNetworkConfig(config.interfaces);

    // 3. Save to DB
    const stmt = db.prepare(`
        INSERT INTO server_ai_analysis (server_id, type, content)
        VALUES (?, 'network', ?)
    `);
    stmt.run(serverId, explanation);

    console.log(`[AI Analysis] Completed & Saved for Server ${serverId}.`);
    return explanation;
}
