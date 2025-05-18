
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

async function handleAuthAndPath(segments: string[]): Promise<{ tokenData: import('@/lib/auth-token').TokenData; relativePath: string; absolutePath: string } | { errorResponse: NextResponse }> {
  if (segments.length < 1) {
    return { errorResponse: NextResponse.json({ message: 'Access token and path required' }, { status: 400 }) };
  }

  const token = segments[0];
  const relativePathParts = segments.slice(1);
  // path.join on empty relativePathParts (e.g. /api/files/TOKEN/) results in '.'
  const relativePath = path.join(...relativePathParts).replace(/\\/g, '/'); // Ensure forward slashes

  const tokenData = validateToken(token, relativePath);

  if (!tokenData) {
    return { errorResponse: NextResponse.json({ message: 'Invalid or expired token, or path mismatch' }, { status: 403 }) };
  }
  
  // getAbsolutePath expects a path relative to UPLOADS_DIR. 
  // If relativePath is '.', sanitizePath will join it with UPLOADS_DIR resulting in UPLOADS_DIR itself.
  const absolutePath = getAbsolutePath(relativePath); 
  return { tokenData, relativePath, absolutePath };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { segments: string[] } }
) {
  const authResult = await handleAuthAndPath(params.segments);
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const { relativePath } = authResult; // relativePath could be '.' if accessing root

  try {
    const stats = await getFileStats(relativePath); // getFileStats handles '.' as UPLOADS_DIR
    if (!stats || stats.isDirectory()) {
      // Do not serve directories directly via GET for file content
      return NextResponse.json({ message: 'Path is a directory or does not exist' }, { status: 404 });
    }

    const fileStream = await getFileStream(relativePath);
    
    return new NextResponse(fileStream as any, { // Cast to any for Next 15.2.3 compatibility with ReadableStream
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream', 
        'Content-Disposition': `attachment; filename="${path.basename(relativePath === '.' ? '' : relativePath)}"`, // Handle basename('.')
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

  // Ensure the path is not trying to overwrite a directory with a file
   const stats = await getFileStats(relativePath);
   if (stats && stats.isDirectory()) {
     return NextResponse.json({ message: 'Cannot overwrite a directory with a file. Target path must be a file path.' }, { status: 400 });
   }
   // Also, if relativePath is '.', it implies uploading to the root, which needs a filename.
   // The target path for PATCH should be a full file path.
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
    await writeFile(relativePath, fileBuffer); // writeFile will create parent dirs if needed

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
  const { relativePath } = authResult; // relativePath can be '.' for root

  try {
    const stats = await getFileStats(relativePath);
    if (!stats) {
       return NextResponse.json({ message: 'File or folder not found' }, { status: 404 });
    }
    // If relativePath is '.', it refers to the UPLOADS_DIR root.
    // Deleting '.' (UPLOADS_DIR itself) is generally not allowed or intended via this API.
    // The admin panel allows deleting specific items. A token for "" (root) should allow deleting items *within* root.
    // If relativePath is '.', it means deleting the entire content of UPLOADS_DIR if the token allows root.
    // This seems too dangerous for a general DELETE on '/api/files/TOKEN/'.
    // The admin panel's delete-item POSTs specific paths.
    // Let's restrict deleting '.' (the root itself) via this generic endpoint.
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
