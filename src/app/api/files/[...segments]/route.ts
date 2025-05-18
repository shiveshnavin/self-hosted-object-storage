
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
import path from 'path'; // Node.js path
import type { Readable } from 'stream'; // Import type if only used for type hinting
import type { TokenData } from '@/lib/auth-token';

async function handleAuthAndPath(segments: string[]): Promise<{ tokenData: TokenData; relativePath: string; absolutePath: string } | { errorResponse: NextResponse }> {
  if (segments.length < 1) {
    return { errorResponse: NextResponse.json({ message: 'Access token and path required' }, { status: 400 }) };
  }

  const token = segments[0];
  const relativePathParts = segments.slice(1);
  const relativePath = path.join(...relativePathParts).replace(/\\/g, '/'); 

  const tokenData = await validateToken(token, relativePath); // validateToken is now async

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
    
    return new NextResponse(fileStream as any, { 
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream', 
        'Content-Disposition': `attachment; filename="${path.basename(relativePath === '.' ? '' : relativePath)}"`, 
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
  const { relativePath } = authResult;

   const stats = await getFileStats(relativePath);
   if (stats && stats.isDirectory()) {
     return NextResponse.json({ message: 'Cannot overwrite a directory with a file. Target path must be a file path.' }, { status: 400 });
   }
   if (relativePath === '.' || relativePath.endsWith('/')) {
       return NextResponse.json({ message: 'Target path for upload must be a specific file, not a directory.' }, { status: 400 });
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
    if (relativePath === '.') {
        return NextResponse.json({ message: "Deleting the root directory via this endpoint is not permitted. Delete specific items." }, { status: 403 });
    }

    await deleteItem(relativePath);
    return NextResponse.json({ message: `Successfully deleted ${relativePath}` });
  } catch (error) {
    console.error(`Error deleting ${relativePath}:`, error);
    return NextResponse.json({ message: 'Error deleting item' }, { status: 500 });
  }
}
