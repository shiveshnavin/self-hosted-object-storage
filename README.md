<h1 align="center">Self Hosted Object Storage</h1>

<p align="center">
  A lightweight Node.js/Express server offering token-based preauthenticated URLs 
  for hierarchical file upload (PATCH) and deletion (DELETE), with automatic directory 
  creation and empty-folder cleanup.
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/098a2299-322c-4c31-9f28-6109a9ab0660" 
       alt="hld" width="512px">
</p>

<br>


## Features
 - Pre-authenticated URLs — Create pre-authenticated URLs with a path prefix (e.g., myapi.com/<JWT TOKEN>/path/to/prefix/file.my) where the access token only works for that prefix path.
 - File Upload/Replace API — PATCH API to upload/replace a file and automatically create the directory structure if it does not exist.
 - File Deletion API — DELETE API to delete files. If a folder becomes empty after deletion, automatically delete the folder as well.
 - JWT Support - Use any tool to create JWT token with access path scope defined


 ## Usage

 Generate a jwt using

 http://jwtbuilder.jamiekurtz.com/

 make sure to specify a field `path` in the payload with the prefix of the path (relative to `./storage` dir)

 For DIR index viewing with nginx make sure the url ends with `/`

 ## NGINX Integration

 To utilize the maximum power of the service, couple it with nginx.

 ```

server {
    server_name objectstorage.myserver.com;
    include /etc/nginx/snippets/ssl.conf;

    #  For DIR index viewing with nginx make sure the url ends with `/`
    
    # Allow read access to files
    # sudo find /path/to/self-hosted-object-storage/storage -type f -exec chmod o+r {} \;
    # Allow directory traversal (execute) for all folders
    # sudo find /path/to/self-hosted-object-storage/storage -type d -exec chmod o+rx {} \;
    # chmod o+rx /path/to /path/to/node/self-hosted-object-storage
    
    # Auth check location
    location = /auth-check {
        internal;
        
        client_max_body_size 5G;     
        proxy_http_version 1.1;
        client_body_buffer_size 256k;  
        proxy_request_buffering off;     
        proxy_buffering off; 
        
        proxy_pass http://127.0.0.1:8000$request_uri;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        
        include /etc/nginx/snippets/proxy-headers.conf;
    }

    location ^~ /public/ {
         alias /path/to/self-hosted-object-storage/storage/public/;
        autoindex on;
    }

    location ~ ^/([^/]+)/(.*)$ {
         
        client_max_body_size 5G;     
        proxy_http_version 1.1;
        client_body_buffer_size 256k;  
        proxy_request_buffering off;     
        proxy_buffering off; 
        
        set $auth_token $1;
        set $file_path $2;

        if ($request_method = PUT) {
            proxy_pass http://127.0.0.1:8000;
            break;
        }
        
        if ($request_method = DELETE) {
            proxy_pass http://127.0.0.1:8000;
            break;
        }
    
        auth_request /auth-check;
        auth_request_set $auth_status $upstream_status;

        error_page 401 = @error401;
        error_page 403 = @error403;

       
        root /path/to/self-hosted-object-storage/storage;
        autoindex on;
       rewrite ^/([^/]+)/(.*)$ /$2 break;
    }

    location @error401 {
        return 401 "Unauthorized\n";
    }

    location @error403 {
        return 403 "Forbidden\n";
    }
}

```
