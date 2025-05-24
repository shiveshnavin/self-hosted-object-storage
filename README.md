# Self Hosted Object Storage

A lightweight Node.js/Express server offering token‑based preauthenticated URLs for hierarchical file upload (PATCH) and deletion (DELETE), with automatic directory creation and empty‑folder cleanup.

## Features
 - Admin Console — Simple HTML-based admin console to list files, create pre-authenticated URLs, upload/replace files, and delete files/empty folders.
 - Pre-authenticated URLs — Create pre-authenticated URLs with a path prefix (e.g., myapi.com/api/<ACCESS TOKEN>/path/to/prefix) where the access token only works for that prefix path.
 - Directory Listing API — GET API to list files and directories within a given path.
 - File Upload/Replace API — PATCH API to upload/replace a file and automatically create the directory structure if it does not exist.
 - File Deletion API — DELETE API to delete files. If a folder becomes empty after deletion, automatically delete the folder as well.
 - Token Storage — Uses MultiDBORM to store access tokens.


 ## Usage

 Generate a jwt using

 http://jwtbuilder.jamiekurtz.com/

 make sure to specify a field `path` in the payload with the prefix of the path (relative to `./storage` dir)