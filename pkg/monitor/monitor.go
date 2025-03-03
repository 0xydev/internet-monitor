package monitor

import (
	"net"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ConnectionStatus represents the status of an internet connection
type ConnectionStatus struct {
	Timestamp time.Time `json:"timestamp"`
	IsOnline  bool      `json:"is_online"`
	Latency   int64     `json:"latency_ms"` // in milliseconds
	Target    string    `json:"target"`
}

// Monitor represents an internet connection monitor
type Monitor struct {
	Target         string        // Host to ping (e.g., "8.8.8.8" or "google.com")
	CheckInterval  time.Duration // How often to check connection
	StatusCallback func(status ConnectionStatus)
	stopChan       chan struct{}
}

// NewMonitor creates a new internet connection monitor
func NewMonitor(target string, interval time.Duration, callback func(status ConnectionStatus)) *Monitor {
	if target == "" {
		target = "8.8.8.8" // Default to Google DNS
	}
	if interval < time.Second {
		interval = 5 * time.Second // Default to 5 seconds
	}
	return &Monitor{
		Target:         target,
		CheckInterval:  interval,
		StatusCallback: callback,
		stopChan:       make(chan struct{}),
	}
}

// Start begins monitoring the internet connection
func (m *Monitor) Start() {
	ticker := time.NewTicker(m.CheckInterval)
	defer ticker.Stop()

	// Perform an initial check
	status := m.checkConnection()
	if m.StatusCallback != nil {
		m.StatusCallback(status)
	}

	for {
		select {
		case <-ticker.C:
			status := m.checkConnection()
			if m.StatusCallback != nil {
				m.StatusCallback(status)
			}
		case <-m.stopChan:
			return
		}
	}
}

// Stop halts the monitoring
func (m *Monitor) Stop() {
	close(m.stopChan)
}

// checkConnection tests the internet connection and returns its status
func (m *Monitor) checkConnection() ConnectionStatus {
	start := time.Now()
	isOnline := false
	latency := int64(-1) // -1 indicates no connection

	// Use different ping methods based on OS
	if runtime.GOOS == "windows" {
		isOnline, latency = m.pingWindows()
	} else {
		isOnline, latency = m.pingUnix()
	}

	return ConnectionStatus{
		Timestamp: start,
		IsOnline:  isOnline,
		Latency:   latency,
		Target:    m.Target,
	}
}

// pingUnix pings the target on Unix-like systems
func (m *Monitor) pingUnix() (bool, int64) {
	cmd := exec.Command("ping", "-c", "1", "-W", "2", m.Target)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false, -1
	}

	// Parse the output to get latency
	outputStr := string(output)
	
	// Use regex to find the time value
	re := regexp.MustCompile(`time=(\d+\.?\d*)\s*ms`)
	matches := re.FindStringSubmatch(outputStr)
	
	if len(matches) > 1 {
		// Convert to float and then to int64
		latencyStr := matches[1]
		latency, err := strconv.ParseFloat(latencyStr, 64)
		if err == nil {
			return true, int64(latency)
		}
	}
	
	// If we couldn't parse the latency but the ping was successful
	if strings.Contains(outputStr, "1 received") || strings.Contains(outputStr, "1 packets received") {
		return true, 0
	}

	return false, -1
}

// pingWindows pings the target on Windows systems
func (m *Monitor) pingWindows() (bool, int64) {
	cmd := exec.Command("ping", "-n", "1", "-w", "2000", m.Target)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false, -1
	}

	// Parse the output to get latency
	outputStr := string(output)
	
	// Use regex to find the time value
	re := regexp.MustCompile(`time[=<](\d+\.?\d*)\s*ms`)
	matches := re.FindStringSubmatch(outputStr)
	
	if len(matches) > 1 {
		// Convert to float and then to int64
		latencyStr := matches[1]
		latency, err := strconv.ParseFloat(latencyStr, 64)
		if err == nil {
			return true, int64(latency)
		}
	}
	
	// If we couldn't parse the latency but the ping was successful
	if strings.Contains(outputStr, "Received = 1") || strings.Contains(outputStr, "Lost = 0") {
		return true, 0
	}

	return false, -1
}

// IsReachable checks if a host is reachable via TCP
func IsReachable(host string, port string, timeout time.Duration) bool {
	address := net.JoinHostPort(host, port)
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	if conn != nil {
		conn.Close()
		return true
	}
	return false
} 