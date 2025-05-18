
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

    let finalExpiresInMs: number | undefined;

    if (expiresInHours !== undefined) {
      const hoursNum = Number(expiresInHours); 
      if (isNaN(hoursNum) || hoursNum < 0) {
        return NextResponse.json({ message: 'expiresInHours must be a valid non-negative number' }, { status: 400 });
      }
      finalExpiresInMs = hoursNum * 60 * 60 * 1000; 
    }
    
    const tokenData = await generateToken(pathPrefix, finalExpiresInMs); // generateToken is now async
    
    const fullAccessUrlPreview = `${request.nextUrl.origin}/api/files/${tokenData.token}/${tokenData.pathPrefix}`;

    return NextResponse.json({ 
      accessToken: tokenData.token, 
      pathPrefix: tokenData.pathPrefix,
      expiresAt: tokenData.expiry === Number.MAX_SAFE_INTEGER ? 'Never Expires' : new Date(tokenData.expiry).toISOString(),
      accessUrlPreview: fullAccessUrlPreview 
    });
  } catch (error) {
    console.error('Error generating token:', error);
    // Check if the error is due to DB initialization failure
    if (error instanceof Error && error.message.includes('Failed to initialize token database')) {
        return NextResponse.json({ message: 'Server configuration error: Could not initialize token storage.' }, { status: 503 }); // Service Unavailable
    }
    return NextResponse.json({ message: 'Error generating token' }, { status: 500 });
  }
}
