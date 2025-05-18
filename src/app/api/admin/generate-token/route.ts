
import { NextResponse, type NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth-token';
import { UPLOADS_DIR } from '@/lib/file-system';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pathPrefix, expiresInHours } = body; // expiresInHours can be string, number, or undefined

    if (typeof pathPrefix !== 'string') {
      return NextResponse.json({ message: 'pathPrefix is required and must be a string' }, { status: 400 });
    }

    let finalExpiresInMs: number | undefined;

    if (expiresInHours !== undefined) {
      const hoursNum = Number(expiresInHours); // Converts "0", 0, "24", 24 to respective numbers. "" becomes 0. "abc" becomes NaN.
      if (isNaN(hoursNum) || hoursNum < 0) {
        return NextResponse.json({ message: 'expiresInHours must be a valid non-negative number' }, { status: 400 });
      }
      finalExpiresInMs = hoursNum * 60 * 60 * 1000; // If hoursNum is 0, finalExpiresInMs will be 0.
    }
    // If expiresInHours was not provided (is undefined), finalExpiresInMs remains undefined, and generateToken will use its default.
    
    const tokenData = generateToken(pathPrefix, finalExpiresInMs);
    
    const fullAccessUrlPreview = `${request.nextUrl.origin}/api/files/${tokenData.token}/${tokenData.pathPrefix}`;

    return NextResponse.json({ 
      accessToken: tokenData.token, 
      pathPrefix: tokenData.pathPrefix,
      expiresAt: tokenData.expiry === Number.MAX_SAFE_INTEGER ? 'Never Expires' : new Date(tokenData.expiry).toISOString(),
      accessUrlPreview: fullAccessUrlPreview 
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ message: 'Error generating token' }, { status: 500 });
  }
}
