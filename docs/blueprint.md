# **App Name**: SelfHostedObjectStorage

## Core Features:

- Admin Console: Simple HTML-based admin console to list files, create pre-authenticated URLs, upload/replace files, and delete files/empty folders.
- Pre-authenticated URLs: Create pre-authenticated URLs with a path prefix (e.g., myapi.com/api/<ACCESS TOKEN>/path/to/prefix) where the access token only works for that prefix path.
- File Upload/Replace API: PATCH API to upload/replace a file and automatically create the directory structure if it does not exist.
- File Deletion API: DELETE API to delete files. If a folder becomes empty after deletion, automatically delete the folder as well.

## Style Guidelines:

- Primary color: Deep Blue (#3F51B5) to convey stability and trust.
- Background color: Light Gray (#EEEEEE) for a clean and neutral backdrop.
- Accent color: Teal (#26A69A) for interactive elements like buttons and links, providing a fresh and modern touch.
- Clean and readable sans-serif font for the admin console interface.
- Simple and intuitive icons for file management actions.
- A straightforward, table-based layout for the admin console, focusing on functionality and ease of use.