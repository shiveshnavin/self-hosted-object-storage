package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

var (
	StorageDir = "./storage"
	Secret     = []byte("aezakmi") // override with env if needed
)

type Claims struct {
	Path string `json:"path"`
	jwt.RegisteredClaims
}

func getTokenInfo(tokenStr string) (*regexp.Regexp, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return Secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		re, err := regexp.Compile(claims.Path)
		if err != nil {
			return nil, err
		}
		return re, nil
	}
	return nil, errors.New("invalid token claims")
}

// Auth middleware to check token and path regex
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Expect URL format: /{token}/path/to/file
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 2)
		if len(parts) < 2 {
			http.Error(w, "Missing token", http.StatusUnauthorized)
			return
		}
		token := parts[0]
		fullPath := "/" + parts[1]

		re, err := getTokenInfo(token)
		if err != nil || re == nil {
			http.Error(w, "Forbidden: Invalid token", http.StatusForbidden)
			return
		}

		if re.MatchString(fullPath) {
			fmt.Println("auth OK", r.URL.Path)
			next.ServeHTTP(w, r)
			return
		} else {
			http.Error(w, "Forbidden: Path not allowed", http.StatusForbidden)
			return
		}
	})
}

// Default handler for unmatched routes
func defaultHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"message": "OK"})
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 2)
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	relPath := parts[1]
	dest := filepath.Join(StorageDir, relPath)

	// Create parent directories if not exist
	err := os.MkdirAll(filepath.Dir(dest), 0755)
	if err != nil {
		http.Error(w, "Failed to create directories: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Create destination file
	out, err := os.Create(dest)
	if err != nil {
		http.Error(w, "Failed to create file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer out.Close()

	// Stream request body to file
	if _, err := io.Copy(out, r.Body); err != nil {
		http.Error(w, "Failed to write file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("uploaded %s\n", relPath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "path": relPath})
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 2)
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	relPath := parts[1]
	target := filepath.Join(StorageDir, relPath)

	if _, err := os.Stat(target); os.IsNotExist(err) {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	err := os.Remove(target)
	if err != nil {
		http.Error(w, "Failed to delete: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Remove empty parent directories up to storage root
	dir := filepath.Dir(target)
	stop := filepath.Clean(StorageDir)

	for strings.HasPrefix(dir, stop) {
		files, err := os.ReadDir(dir)
		if err != nil || len(files) > 0 {
			break
		}
		os.Remove(dir)
		dir = filepath.Dir(dir)
	}

	fmt.Printf("deleted %s\n", relPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func main() {
	// Override secret from env if available
	if s := os.Getenv("SECRET"); s != "" {
		Secret = []byte(s)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/") {
			if r.Method == http.MethodPut {
				uploadHandler(w, r)
				return
			}
			if r.Method == http.MethodDelete {
				deleteHandler(w, r)
				return
			}
		}
		defaultHandler(w, r)
	})

	fmt.Println("Server listening on :8000")
	err := http.ListenAndServe(":8000", authMiddleware(mux))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
		os.Exit(1)
	}
}
