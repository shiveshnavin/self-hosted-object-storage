import { NextResponse, type NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth-token';
import { UPLOADS_DIR } from '@/lib/file-system';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pathPrefix, expiresInHours } = body;

    if (typeof pathPrefix !== 'string') {
      return NextResponse.json({ message: 'pathPrefix is required and must be a string' }, { status: 400 });
    }

    const expiresInMs = expiresInHours ? parseInt(expiresInHours, 10) * 60 * 60 * 1000 : undefined;
    if (expiresInHours && isNaN(expiresInMs as number)) {
      return NextResponse.json({ message: 'expiresInHours must be a valid number' }, { status: 400 });
    }
    
    const tokenData = generateToken(pathPrefix, expiresInMs);
    
    const fullAccessUrlPreview = `${request.nextUrl.origin}/api/files/${tokenData.token}/${tokenData.pathPrefix}`;

    return NextResponse.json({ 
      accessToken: tokenData.token, 
      pathPrefix: tokenData.pathPrefix,
      expiresAt: new Date(tokenData.expiry).toISOString(),
      accessUrlPreview: fullAccessUrlPreview 
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ message: 'Error generating token' }, { status: 500 });
  }
}
