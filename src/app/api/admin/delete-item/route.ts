import { NextResponse, type NextRequest } from 'next/server';
import { deleteItem } from '@/lib/file-system';

export async function POST(request: NextRequest) { // Using POST for simplicity, could be DELETE
  try {
    const body = await request.json();
    const { path: itemPath } = body;

    if (!itemPath || typeof itemPath !== 'string') {
      return NextResponse.json({ message: 'Item path is required' }, { status: 400 });
    }

    await deleteItem(itemPath);
    return NextResponse.json({ message: `Successfully deleted ${itemPath}` });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json({ message: 'Error deleting item' }, { status: 500 });
  }
}
