
import db from './src/lib/db';
import { getScheduledJobs } from './src/app/actions/schedule';
import { getServers } from './src/app/actions/server';

async function main() {
    console.log('--- Checking DB Tables ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map((t: any) => t.name));

    console.log('\n--- Checking Servers ---');
    try {
        const servers = await getServers();
        console.log(`Servers count: ${servers.length}`);
        console.log('Servers type:', Array.isArray(servers) ? 'Array' : typeof servers);
    } catch (e) {
        console.error('getServers error:', e);
    }

    console.log('\n--- Checking Scheduled Jobs ---');
    try {
        const jobs = await getScheduledJobs();
        console.log(`Jobs count: ${jobs.length}`);
        console.log('Jobs type:', Array.isArray(jobs) ? 'Array' : typeof jobs);
        console.log('Jobs content:', JSON.stringify(jobs, null, 2));
    } catch (e) {
        console.error('getScheduledJobs error:', e);
    }
}

main().catch(console.error);
