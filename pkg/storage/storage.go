package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/0xydev/internet-monitor/pkg/monitor"
)

// Storage handles the persistence of connection status data
type Storage struct {
	dataDir      string
	currentFile  string
	mutex        sync.Mutex
	maxFileSize  int64 // Maximum file size in bytes before rotation
	maxFileAge   time.Duration
	rotationTime time.Time
}

// NewStorage creates a new storage instance
func NewStorage(dataDir string) (*Storage, error) {
	// Create data directory if it doesn't exist
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &Storage{
		dataDir:     dataDir,
		maxFileSize: 10 * 1024 * 1024, // 10MB default
		maxFileAge:  24 * time.Hour,   // 1 day default
	}

	// Set up the initial file
	if err := s.rotateFileIfNeeded(); err != nil {
		return nil, err
	}

	return s, nil
}

// StoreStatus saves a connection status to the storage
func (s *Storage) StoreStatus(status monitor.ConnectionStatus) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Check if we need to rotate the file
	if err := s.rotateFileIfNeeded(); err != nil {
		return err
	}

	// Marshal the status to JSON
	data, err := json.Marshal(status)
	if err != nil {
		return fmt.Errorf("failed to marshal status: %w", err)
	}

	// Append to the current file
	f, err := os.OpenFile(s.currentFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("failed to write to log file: %w", err)
	}
	if _, err := f.WriteString("\n"); err != nil {
		return fmt.Errorf("failed to write newline to log file: %w", err)
	}

	return nil
}

// GetStatusHistory retrieves connection status history within a time range
func (s *Storage) GetStatusHistory(start, end time.Time) ([]monitor.ConnectionStatus, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	var results []monitor.ConnectionStatus

	// List all log files
	files, err := filepath.Glob(filepath.Join(s.dataDir, "connection-*.log"))
	if err != nil {
		return nil, fmt.Errorf("failed to list log files: %w", err)
	}

	// Process each file
	for _, file := range files {
		// Skip files that are definitely outside our time range
		// This would require parsing the filename to extract the date
		// For simplicity, we'll just check all files for now

		data, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("failed to read log file %s: %w", file, err)
		}

		// Process each line
		lines := splitLines(string(data))
		for _, line := range lines {
			if line == "" {
				continue
			}

			var status monitor.ConnectionStatus
			if err := json.Unmarshal([]byte(line), &status); err != nil {
				// Skip invalid lines
				continue
			}

			// Check if the status is within our time range
			if (status.Timestamp.Equal(start) || status.Timestamp.After(start)) &&
				(status.Timestamp.Equal(end) || status.Timestamp.Before(end)) {
				results = append(results, status)
			}
		}
	}

	return results, nil
}

// GetRecentStatuses retrieves the most recent connection statuses
func (s *Storage) GetRecentStatuses(limit int) ([]monitor.ConnectionStatus, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if limit <= 0 {
		limit = 100 // Default limit
	}

	var results []monitor.ConnectionStatus

	// Read the current file
	if s.currentFile == "" {
		return results, nil
	}

	data, err := os.ReadFile(s.currentFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read current log file: %w", err)
	}

	// Process each line
	lines := splitLines(string(data))
	
	// Start from the end to get the most recent entries
	startIdx := len(lines)
	if startIdx > limit {
		startIdx = len(lines) - limit
	} else {
		startIdx = 0
	}

	for i := startIdx; i < len(lines); i++ {
		if lines[i] == "" {
			continue
		}

		var status monitor.ConnectionStatus
		if err := json.Unmarshal([]byte(lines[i]), &status); err != nil {
			// Skip invalid lines
			continue
		}

		results = append(results, status)
	}

	return results, nil
}

// rotateFileIfNeeded checks if the current log file needs to be rotated
// and creates a new one if necessary
func (s *Storage) rotateFileIfNeeded() error {
	// Check if we need to create a new file based on time
	now := time.Now()
	if s.currentFile == "" || now.After(s.rotationTime) {
		// Create a new file with the current timestamp
		filename := filepath.Join(s.dataDir, fmt.Sprintf("connection-%s.log", now.Format("2006-01-02")))
		s.currentFile = filename
		s.rotationTime = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
		return nil
	}

	// Check if the current file is too large
	if s.currentFile != "" {
		info, err := os.Stat(s.currentFile)
		if err == nil && info.Size() > s.maxFileSize {
			// Create a new file with the current timestamp
			filename := filepath.Join(s.dataDir, fmt.Sprintf("connection-%s-%d.log", 
				time.Now().Format("2006-01-02-15-04-05"), time.Now().UnixNano()))
			s.currentFile = filename
			return nil
		}
	}

	return nil
}

// Helper function to split a string into lines
func splitLines(s string) []string {
	var lines []string
	var line string
	for _, r := range s {
		if r == '\n' {
			lines = append(lines, line)
			line = ""
		} else {
			line += string(r)
		}
	}
	if line != "" {
		lines = append(lines, line)
	}
	return lines
} 