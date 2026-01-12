import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Get version info
export async function GET() {
    try {
        const projectRoot = process.cwd();

        // Read current version from package.json
        const packagePath = path.join(projectRoot, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        const currentVersion = packageJson.version;

        // Get current git commit
        let currentCommit = 'unknown';
        let updateAvailable = false;
        let remoteCommit = 'unknown';
        let commitsBehind = 0;

        try {
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: projectRoot });
            currentCommit = commitHash.trim().substring(0, 7);

            // Fetch latest from remote
            await execAsync('git fetch origin main', { cwd: projectRoot });

            // Check if we're behind
            const { stdout: behindCount } = await execAsync(
                'git rev-list HEAD..origin/main --count',
                { cwd: projectRoot }
            );
            commitsBehind = parseInt(behindCount.trim()) || 0;
            updateAvailable = commitsBehind > 0;

            if (updateAvailable) {
                const { stdout: remoteHash } = await execAsync(
                    'git rev-parse origin/main',
                    { cwd: projectRoot }
                );
                remoteCommit = remoteHash.trim().substring(0, 7);
            }
        } catch (e) {
            console.error('Git check failed:', e);
        }

        return NextResponse.json({
            currentVersion,
            currentCommit,
            updateAvailable,
            remoteCommit,
            commitsBehind
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to check version' },
            { status: 500 }
        );
    }
}

// Perform update
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (message: string) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message })}\n\n`));
            };

            try {
                const projectRoot = process.cwd();

                send('🔄 Starting update...');
                send('📥 Pulling latest changes...');

                // Git pull
                const { stdout: pullOut, stderr: pullErr } = await execAsync(
                    'git pull origin main',
                    { cwd: projectRoot }
                );
                send(pullOut || pullErr || 'Git pull complete');

                send('📦 Installing dependencies...');

                // npm install
                const { stdout: npmOut, stderr: npmErr } = await execAsync(
                    'npm install --include=dev',
                    { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 }
                );
                send('Dependencies installed');

                send('🔨 Building application...');

                // npm build
                const { stdout: buildOut, stderr: buildErr } = await execAsync(
                    'npm run build',
                    { cwd: projectRoot, maxBuffer: 1024 * 1024 * 50 }
                );
                send('Build complete');

                send('🔄 Restarting service...');

                // Restart service (this might fail if not running as systemd service)
                try {
                    await execAsync('sudo systemctl restart proxhost-backup', { cwd: projectRoot });
                    send('✅ Service restarted');
                } catch (e) {
                    send('⚠️ Could not restart service automatically. Please restart manually.');
                }

                send('✅ Update complete!');
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                send(`❌ Error: ${errorMsg}`);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
            }

            controller.close();
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
