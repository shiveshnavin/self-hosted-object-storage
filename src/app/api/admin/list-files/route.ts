import { NextResponse, type NextRequest } from 'next/server';
import { listDirectoryContents } from '@/lib/file-system';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';

  try {
    const items = await listDirectoryContents(path);
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json({ message: 'Error listing files' }, { status: 500 });
  }
}
