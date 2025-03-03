package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/0xydev/internet-monitor/pkg/monitor"
	"github.com/0xydev/internet-monitor/pkg/storage"
)

var (
	port         = flag.Int("port", 8080, "HTTP server port")
	target       = flag.String("target", "8.8.8.8", "Target host to ping")
	interval     = flag.Int("interval", 5, "Check interval in seconds")
	dataDir      = flag.String("data-dir", "./data", "Directory to store connection data")
	staticDir    = flag.String("static-dir", "./web/static", "Directory for static web files")
	templatesDir = flag.String("templates-dir", "./web/templates", "Directory for HTML templates")
)

func main() {
	flag.Parse()

	// Create data directory if it doesn't exist
	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Initialize storage
	store, err := storage.NewStorage(*dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	// Initialize monitor
	mon := monitor.NewMonitor(*target, time.Duration(*interval)*time.Second, func(status monitor.ConnectionStatus) {
		if err := store.StoreStatus(status); err != nil {
			log.Printf("Failed to store connection status: %v", err)
		}
	})

	// Start monitoring in a goroutine
	go mon.Start()
	log.Printf("Started monitoring %s every %d seconds", *target, *interval)

	// Set up HTTP server
	setupHTTPServer(store)

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
	mon.Stop()
}

func setupHTTPServer(store *storage.Storage) {
	// Serve static files
	fs := http.FileServer(http.Dir(*staticDir))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// Serve index page
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(*templatesDir, "index.html"))
	})

	// API endpoints
	http.HandleFunc("/api/status/recent", func(w http.ResponseWriter, r *http.Request) {
		limit := 100
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
				limit = l
			}
		}

		statuses, err := store.GetRecentStatuses(limit)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get recent statuses: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statuses)
	})

	http.HandleFunc("/api/status/history", func(w http.ResponseWriter, r *http.Request) {
		// Default to last 24 hours
		end := time.Now()
		start := end.Add(-24 * time.Hour)

		// Parse start time if provided
		if startStr := r.URL.Query().Get("start"); startStr != "" {
			if t, err := time.Parse(time.RFC3339, startStr); err == nil {
				start = t
			}
		}

		// Parse end time if provided
		if endStr := r.URL.Query().Get("end"); endStr != "" {
			if t, err := time.Parse(time.RFC3339, endStr); err == nil {
				end = t
			}
		}

		statuses, err := store.GetStatusHistory(start, end)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get status history: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statuses)
	})

	// Start HTTP server
	go func() {
		addr := fmt.Sprintf(":%d", *port)
		log.Printf("HTTP server listening on %s", addr)
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()
} 