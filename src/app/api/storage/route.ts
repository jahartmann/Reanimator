import { NextResponse } from 'next/server';
import { getStorageStats } from '@/app/actions/storage';

export async function GET() {
    const stats = await getStorageStats();
    return NextResponse.json(stats);
}
