import { NextResponse, type NextRequest } from 'next/server';
import { validateToken } from '@/lib/auth-token';
import { 
  readFile, 
  writeFile, 
  deleteItem, 
  getFileStats,
  getAbsolutePath,
  getFileStream
} from '@/lib/file-system';
import path from 'path';
import { Readable } from 'stream';

async function handleAuthAndPath(segments: string[]): Promise<{ tokenData: import('@/lib/auth-token').TokenData; relativePath: string; absolutePath: string } | { errorResponse: NextResponse }> {
  if (segments.length < 1) {
    return { errorResponse: NextResponse.json({ message: 'Access token and path required' }, { status: 400 }) };
  }

  const token = segments[0];
  const relativePathParts = segments.slice(1);
  const relativePath = path.join(...relativePathParts).replace(/\\/g, '/');

  if (!relativePath) {
    // If relative path is empty, it means user is trying to access the root of the token's prefix
    // This is valid if the token prefix is a directory.
    const tempTokenData = validateToken(token, ''); // Check with empty string first
    if (tempTokenData && tempTokenData.pathPrefix.endsWith('/')) {
       // Allow if token prefix is a directory and user accesses its root
    } else if (tempTokenData && relativePath === '' && !tempTokenData.pathPrefix.endsWith('/')) {
        // This means token prefix is a file, and user tried to access just /api/files/TOKEN/
        // This is not a valid file path.
        return { errorResponse: NextResponse.json({ message: 'Invalid file path for file-specific token' }, { status: 400 }) };
    }
    // If tempTokenData is null, validateToken below will handle it
  }


  const tokenData = validateToken(token, relativePath);

  if (!tokenData) {
    return { errorResponse: NextResponse.json({ message: 'Invalid or expired token, or path mismatch' }, { status: 403 }) };
  }
  
  const absolutePath = getAbsolutePath(relativePath);
  return { tokenData, relativePath, absolutePath };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { segments: string[] } }
) {
  const authResult = await handleAuthAndPath(params.segments);
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const { relativePath } = authResult;

  try {
    const stats = await getFileStats(relativePath);
    if (!stats || stats.isDirectory()) {
      return NextResponse.json({ message: 'Path is a directory or does not exist' }, { status: 404 });
    }

    const fileStream = await getFileStream(relativePath);
    
    return new NextResponse(fileStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream', // Generic content type
        'Content-Disposition': `attachment; filename="${path.basename(relativePath)}"`,
        'Content-Length': stats.size.toString(),
      },
    });

  } catch (error: any) {
    console.error(`Error serving file ${relativePath}:`, error);
    if (error.code === 'ENOENT') {
      return NextResponse.json({ message: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error serving file' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { segments: string[] } }
) {
  const authResult = await handleAuthAndPath(params.segments);
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const { relativePath, tokenData } = authResult;

  // Ensure the path is not trying to overwrite a directory with a file
   const stats = await getFileStats(relativePath);
   if (stats && stats.isDirectory()) {
     return NextResponse.json({ message: 'Cannot overwrite a directory with a file' }, { status: 400 });
   }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'File data is required in FormData' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(relativePath, fileBuffer);

    return NextResponse.json({ message: `File ${file.name} uploaded successfully to ${relativePath}` });
  } catch (error) {
    console.error(`Error uploading file to ${relativePath}:`, error);
    return NextResponse.json({ message: 'Error uploading file' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { segments: string[] } }
) {
  const authResult = await handleAuthAndPath(params.segments);
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const { relativePath } = authResult;

  try {
    const stats = await getFileStats(relativePath);
    if (!stats) {
       return NextResponse.json({ message: 'File or folder not found' }, { status: 404 });
    }
    await deleteItem(relativePath);
    return NextResponse.json({ message: `Successfully deleted ${relativePath}` });
  } catch (error) {
    console.error(`Error deleting ${relativePath}:`, error);
    return NextResponse.json({ message: 'Error deleting item' }, { status: 500 });
  }
}
