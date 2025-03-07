document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const currentStatus = document.getElementById('current-status');
    const statusText = document.getElementById('status-text');
    const latencyText = document.getElementById('latency');
    const timeRangeSelect = document.getElementById('time-range-select');
    const customRangeContainer = document.getElementById('custom-range-container');
    const customHoursInput = document.getElementById('custom-hours');
    const customMinutesInput = document.getElementById('custom-minutes');
    const applyCustomRangeBtn = document.getElementById('apply-custom-range');
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshSelect = document.getElementById('auto-refresh-select');
    const themeSwitcher = document.getElementById('theme-switcher');
    const totalOutagesEl = document.getElementById('total-outages');
    const totalOutageTimeEl = document.getElementById('total-outage-time');
    const avgOutageTimeEl = document.getElementById('avg-outage-time');
    const avgLatencyEl = document.getElementById('avg-latency');
    const outagesList = document.getElementById('outages-list');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfoEl = document.getElementById('page-info');
    
    // Chart instance
    let connectionChart = null;
    
    // Auto refresh timer
    let autoRefreshTimer = null;
    
    // Pagination state
    let currentPage = 1;
    let totalPages = 1;
    let allOutages = [];
    const outagesPerPage = 10;
    
    // Initialize the app
    init();
    
    function init() {
        // Set up event listeners
        timeRangeSelect.addEventListener('change', handleTimeRangeChange);
        applyCustomRangeBtn.addEventListener('click', applyCustomRange);
        refreshBtn.addEventListener('click', loadData);
        autoRefreshSelect.addEventListener('change', setAutoRefresh);
        prevPageBtn.addEventListener('click', () => changePage(-1));
        nextPageBtn.addEventListener('click', () => changePage(1));
        
        if (themeSwitcher) {
            themeSwitcher.addEventListener('click', toggleTheme);
            // Set initial theme based on localStorage or system preference
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
                themeSwitcher.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
            } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeSwitcher.textContent = '☀️';
            }
        }
        
        // Load initial data
        loadData();
        
        // Set up initial auto refresh based on select value
        setAutoRefresh();
    }
    
    function handleTimeRangeChange() {
        const selectedValue = timeRangeSelect.value;
        
        if (selectedValue === 'custom') {
            customRangeContainer.style.display = 'flex';
        } else {
            customRangeContainer.style.display = 'none';
            loadData();
        }
    }
    
    function applyCustomRange() {
        const hours = parseInt(customHoursInput.value) || 0;
        const minutes = parseInt(customMinutesInput.value) || 0;
        
        if (hours === 0 && minutes === 0) {
            alert('Lütfen geçerli bir zaman aralığı girin.');
            return;
        }
        
        loadData();
    }
    
    function getTimeRange() {
        const selectedValue = timeRangeSelect.value;
        
        if (selectedValue === 'custom') {
            const hours = parseInt(customHoursInput.value) || 0;
            const minutes = parseInt(customMinutesInput.value) || 0;
            return hours + (minutes / 60);
        }
        
        return parseFloat(selectedValue);
    }
    
    function setAutoRefresh() {
        // Clear existing timer if any
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
        
        const refreshInterval = autoRefreshSelect.value;
        if (refreshInterval !== 'off') {
            const intervalMs = parseInt(refreshInterval) * 1000;
            autoRefreshTimer = setInterval(() => {
                loadData(true);
            }, intervalMs);
        }
    }
    
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update button text
        themeSwitcher.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    async function loadData(isBackgroundRefresh = false) {
        if (!isBackgroundRefresh) {
            showLoading();
        }
        
        try {
            // Get the selected time range in hours
            const hoursRange = getTimeRange();
            const endTime = new Date();
            const startTime = new Date(endTime - hoursRange * 60 * 60 * 1000);
            
            // Format times for API
            const startTimeStr = startTime.toISOString();
            const endTimeStr = endTime.toISOString();
            
            // Fetch data from API
            const response = await fetch(`/api/status/history?start=${startTimeStr}&end=${endTimeStr}`);
            if (!response.ok) {
                throw new Error('API request failed');
            }
            
            const data = await response.json();
            
            // Update UI with the data
            updateCurrentStatus(data);
            updateChart(data, startTime, endTime);
            updateStats(data);
            
            // Find outages and update the list
            allOutages = findOutages(data);
            totalPages = Math.max(1, Math.ceil(allOutages.length / outagesPerPage));
            currentPage = Math.min(currentPage, totalPages);
            updateOutagesList();
            updatePagination();
        } catch (error) {
            console.error('Error loading data:', error);
            if (!isBackgroundRefresh) {
                showError('Veri yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
            }
        }
    }
    
    function updateCurrentStatus(data) {
        if (data.length === 0) {
            statusText.textContent = 'Veri yok';
            currentStatus.className = 'status-unknown';
            latencyText.textContent = '';
            return;
        }
        
        // Get the most recent status
        const latestStatus = data[data.length - 1];
        
        if (latestStatus.is_online) {
            statusText.textContent = 'Çevrimiçi';
            currentStatus.className = 'status-online';
            latencyText.textContent = `Gecikme: ${latestStatus.latency_ms} ms`;
        } else {
            statusText.textContent = 'Çevrimdışı';
            currentStatus.className = 'status-offline';
            latencyText.textContent = '';
        }
    }
    
    function updateChart(data, startTime, endTime) {
        // If chart exists, destroy it
        if (connectionChart) {
            connectionChart.destroy();
            connectionChart = null;
        }
        
        // If no data, show empty chart with the correct time range
        if (data.length === 0) {
            createEmptyChart(startTime, endTime);
            return;
        }
        
        // Prepare data for the chart
        const timestamps = data.map(item => new Date(item.timestamp));
        const latencies = data.map(item => item.is_online ? item.latency_ms : null);
        const onlineStatus = data.map(item => item.is_online ? 1 : 0);
        
        // Create the chart
        createChart(timestamps, latencies, onlineStatus, startTime, endTime);
    }
    
    function clearOutageBackgrounds() {
        const chartWrapper = document.querySelector('.chart-wrapper');
        if (chartWrapper) {
            const outageBackgrounds = chartWrapper.querySelectorAll('.outage-container');
            outageBackgrounds.forEach(bg => bg.remove());
        }
    }
    
    function createEmptyChart(startTime, endTime) {
        const ctx = document.getElementById('connection-chart').getContext('2d');
        connectionChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Gecikme (ms)',
                        data: [],
                        borderColor: 'rgba(52, 152, 219, 0.8)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        yAxisID: 'y-latency',
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'Bağlantı Durumu',
                        data: [],
                        borderColor: 'rgba(46, 204, 113, 0.8)',
                        backgroundColor: 'transparent',
                        yAxisID: 'y-status',
                        stepped: true,
                        pointRadius: 0,
                        borderWidth: 4
                    }
                ]
            },
            options: getChartOptions(startTime, endTime)
        });
    }
    
    function createChart(timestamps, latencies, onlineStatus, startTime, endTime) {
        const ctx = document.getElementById('connection-chart').getContext('2d');
        
        // Prepare data points with x and y coordinates
        const latencyData = [];
        const statusData = [];
        
        for (let i = 0; i < timestamps.length; i++) {
            if (timestamps[i] >= startTime && timestamps[i] <= endTime) {
                if (latencies[i] !== null) {
                    latencyData.push({
                        x: timestamps[i],
                        y: latencies[i]
                    });
                }
                
                statusData.push({
                    x: timestamps[i],
                    y: onlineStatus[i]
                });
            }
        }
        
        // Create the chart
        connectionChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Gecikme (ms)',
                        data: latencyData,
                        borderColor: 'rgba(52, 152, 219, 0.8)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        yAxisID: 'y-latency',
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 2,
                        order: 1
                    },
                    {
                        label: 'Bağlantı Durumu',
                        data: statusData,
                        borderColor: function(context) {
                            // Segment bazında renk değişimi
                            const index = context.dataIndex;
                            if (!context.dataset.data[index]) {
                                return 'rgba(46, 204, 113, 0.8)'; // Varsayılan yeşil
                            }
                            const value = context.dataset.data[index].y;
                            return value === 0 ? 'rgba(231, 76, 60, 0.8)' : 'rgba(46, 204, 113, 0.8)';
                        },
                        backgroundColor: 'transparent',
                        yAxisID: 'y-status',
                        stepped: true,
                        pointRadius: 0,
                        borderWidth: 4,
                        order: 0
                    }
                ]
            },
            options: getChartOptions(startTime, endTime)
        });
    }
    
    function getChartOptions(startTime, endTime) {
        // Determine appropriate time unit based on the time range
        const timeRangeHours = (endTime - startTime) / (1000 * 60 * 60);
        let timeUnit = 'hour';
        let stepSize = 1;
        
        if (timeRangeHours <= 0.5) { // 30 minutes or less
            timeUnit = 'minute';
            stepSize = 5;
        } else if (timeRangeHours <= 2) { // 2 hours or less
            timeUnit = 'minute';
            stepSize = 15;
        } else if (timeRangeHours <= 6) { // 6 hours or less
            timeUnit = 'hour';
            stepSize = 1;
        } else if (timeRangeHours <= 24) { // 24 hours or less
            timeUnit = 'hour';
            stepSize = 2;
        } else if (timeRangeHours <= 72) { // 3 days or less
            timeUnit = 'hour';
            stepSize = 6;
        } else { // more than 3 days
            timeUnit = 'day';
            stepSize = 1;
        }
        
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            animation: {
                duration: 300
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: timeUnit,
                        stepSize: stepSize,
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                            day: 'dd MMM'
                        },
                        tooltipFormat: 'dd MMM yyyy HH:mm:ss'
                    },
                    min: startTime,
                    max: endTime,
                    title: {
                        display: true,
                        text: 'Zaman'
                    },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 0
                    },
                    grid: {
                        color: 'rgba(200, 200, 200, 0.2)'
                    }
                },
                'y-latency': {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Gecikme (ms)'
                    },
                    min: 0,
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(200, 200, 200, 0.2)'
                    }
                },
                'y-status': {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Bağlantı Durumu'
                    },
                    min: 0,
                    max: 1,
                    ticks: {
                        callback: function(value) {
                            return value === 0 ? 'Çevrimdışı' : 'Çevrimiçi';
                        },
                        color: function(context) {
                            const value = context.tick.value;
                            return value === 0 ? 'rgba(231, 76, 60, 0.8)' : 'rgba(46, 204, 113, 0.8)';
                        }
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const datasetLabel = context.dataset.label;
                            const value = context.raw.y;
                            
                            if (datasetLabel === 'Bağlantı Durumu') {
                                return value === 0 ? 'Çevrimdışı' : 'Çevrimiçi';
                            } else if (datasetLabel === 'Gecikme (ms)') {
                                return value !== null ? `${datasetLabel}: ${value} ms` : 'Veri yok';
                            } else {
                                return `${datasetLabel}: ${value}`;
                            }
                        }
                    }
                },
                legend: {
                    labels: {
                        usePointStyle: true,
                        boxWidth: 6
                    }
                }
            }
        };
    }
    
    function updateStats(data) {
        if (data.length === 0) {
            totalOutagesEl.textContent = '0';
            totalOutageTimeEl.textContent = '0 sn';
            avgOutageTimeEl.textContent = '0 sn';
            avgLatencyEl.textContent = '0 ms';
            return;
        }
        
        // Calculate statistics
        let outages = findOutages(data);
        let totalLatency = 0;
        let latencyCount = 0;
        
        // Process data for latency
        for (let i = 0; i < data.length; i++) {
            const status = data[i];
            
            // Track latency for online statuses
            if (status.is_online && status.latency_ms > 0) {
                totalLatency += status.latency_ms;
                latencyCount++;
            }
        }
        
        // Calculate total outage time in minutes
        const totalOutageMinutes = outages.reduce((total, outage) => {
            return total + (outage.end - outage.start) / (1000 * 60);
        }, 0);
        
        // Calculate average outage time
        const avgOutageMinutes = outages.length > 0 ? totalOutageMinutes / outages.length : 0;
        
        // Calculate average latency
        const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
        
        // Update UI
        totalOutagesEl.textContent = outages.length;
        totalOutageTimeEl.textContent = formatMinutes(totalOutageMinutes);
        avgOutageTimeEl.textContent = formatMinutes(avgOutageMinutes);
        avgLatencyEl.textContent = `${avgLatency} ms`;
    }
    
    function findOutages(data) {
        if (data.length === 0) return [];
        
        // Find outages
        let outages = [];
        let currentOutageStart = null;
        
        // Process data to find outages
        for (let i = 0; i < data.length; i++) {
            const status = data[i];
            
            if (!status.is_online && currentOutageStart === null) {
                // Start of an outage
                currentOutageStart = new Date(status.timestamp);
            } else if (status.is_online && currentOutageStart !== null) {
                // End of an outage
                outages.push({
                    start: currentOutageStart,
                    end: new Date(status.timestamp)
                });
                currentOutageStart = null;
            }
        }
        
        // If we're still in an outage at the end of the data
        if (currentOutageStart !== null) {
            outages.push({
                start: currentOutageStart,
                end: new Date() // Current time as the end
            });
        }
        
        // Sort outages by start time (newest first)
        outages.sort((a, b) => b.start - a.start);
        
        return outages;
    }
    
    function updateOutagesList() {
        if (allOutages.length === 0) {
            outagesList.innerHTML = '<tr><td colspan="3" class="loading-text">Kesinti yok</td></tr>';
            // Eğer kesinti yoksa varolan butonları kaldır
            const existingBtnContainer = document.querySelector('.export-buttons-container');
            if (existingBtnContainer) {
                existingBtnContainer.remove();
            }
            return;
        }
        
        // Calculate the slice of outages to show for the current page
        const startIdx = (currentPage - 1) * outagesPerPage;
        const endIdx = Math.min(startIdx + outagesPerPage, allOutages.length);
        const pageOutages = allOutages.slice(startIdx, endIdx);
        
        // Update the UI
        outagesList.innerHTML = pageOutages.map(outage => {
            const duration = (outage.end - outage.start) / (1000 * 60); // Duration in minutes
            return `
                <tr>
                    <td>${formatDateTime(outage.start)}</td>
                    <td>${formatDateTime(outage.end)}</td>
                    <td>${formatMinutes(duration)}</td>
                </tr>
            `;
        }).join('');

        // Varolan buton konteynerini kontrol et
        let exportBtnContainer = document.querySelector('.export-buttons-container');
        
        // Eğer buton konteyneri yoksa oluştur
        if (!exportBtnContainer) {
            exportBtnContainer = document.createElement('div');
            exportBtnContainer.className = 'export-buttons-container';
            exportBtnContainer.innerHTML = `
                <button onclick="window.exportToPDF()" class="export-button pdf-button" data-tooltip="PDF İndir">
                    📑
                </button>
                <button onclick="window.exportToCSV()" class="export-button csv-button" data-tooltip="CSV İndir">
                    📊
                </button>
                <button onclick="window.exportToTXT()" class="export-button txt-button" data-tooltip="TXT İndir">
                    📝
                </button>
            `;
            const outagesContainer = document.querySelector('.outages-container');
            outagesContainer.appendChild(exportBtnContainer);
        }
    }
    
    function updatePagination() {
        pageInfoEl.textContent = `Sayfa ${currentPage} / ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }

    function changePage(delta) {
        const newPage = currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            updateOutagesList();
            updatePagination();
        }
    }

    function showLoading() {
        totalOutagesEl.textContent = 'Yükleniyor...';
        totalOutageTimeEl.textContent = 'Yükleniyor...';
        avgOutageTimeEl.textContent = 'Yükleniyor...';
        avgLatencyEl.textContent = 'Yükleniyor...';
        outagesList.innerHTML = '<tr><td colspan="3" class="loading-text">Yükleniyor...</td></tr>';
    }

    function showError(message) {
        totalOutagesEl.textContent = 'Hata';
        totalOutageTimeEl.textContent = 'Hata';
        avgOutageTimeEl.textContent = 'Hata';
        avgLatencyEl.textContent = 'Hata';
        outagesList.innerHTML = `<tr><td colspan="3" class="loading-text">${message}</td></tr>`;
    }

    // Helper function to format minutes
    function formatMinutes(minutes) {
        if (minutes < 1) {
            return `${Math.round(minutes * 60)} sn`;
        } else if (minutes < 60) {
            return `${Math.round(minutes)} dk`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return `${hours} sa ${mins} dk`;
        }
    }

    // Helper function to format date and time
    function formatDateTime(date) {
        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Add print function to window object
    window.printOutages = function() {
        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        
        // Get current date for report header
        const reportDate = formatDateTime(new Date());
        
        // Create print content with all outages
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Kesinti Raporu - ${reportDate}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        margin: 20px;
                    }
                    .report-header {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .report-title {
                        font-size: 24px;
                        margin-bottom: 10px;
                    }
                    .report-date {
                        color: #666;
                        font-size: 14px;
                    }
                    .stats-container {
                        margin-bottom: 20px;
                        padding: 15px;
                        background-color: #f5f5f5;
                        border-radius: 5px;
                    }
                    .stats-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 12px;
                        text-align: left;
                    }
                    th {
                        background-color: #f5f5f5;
                    }
                    tr:nth-child(even) {
                        background-color: #f9f9f9;
                    }
                    @media print {
                        .stats-container {
                            background-color: #f5f5f5 !important;
                            -webkit-print-color-adjust: exact;
                        }
                        th {
                            background-color: #f5f5f5 !important;
                            -webkit-print-color-adjust: exact;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="report-header">
                    <div class="report-title">İnternet Kesinti Raporu</div>
                    <div class="report-date">Rapor Tarihi: ${reportDate}</div>
                </div>
                
                <div class="stats-container">
                    <div class="stats-title">Özet Bilgiler</div>
                    <div>Toplam Kesinti Sayısı: ${totalOutagesEl.textContent}</div>
                    <div>Toplam Kesinti Süresi: ${totalOutageTimeEl.textContent}</div>
                    <div>Ortalama Kesinti Süresi: ${avgOutageTimeEl.textContent}</div>
                    <div>Ortalama Gecikme: ${avgLatencyEl.textContent}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Başlangıç Zamanı</th>
                            <th>Bitiş Zamanı</th>
                            <th>Süre</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allOutages.map(outage => {
                            const duration = (outage.end - outage.start) / (1000 * 60);
                            return `
                                <tr>
                                    <td>${formatDateTime(outage.start)}</td>
                                    <td>${formatDateTime(outage.end)}</td>
                                    <td>${formatMinutes(duration)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;
        
        // Write content to print window
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // Wait for content to load then print
        printWindow.onload = function() {
            printWindow.print();
        };
    };

    // Add export functions to window object
    window.exportToPDF = function() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // Get current date for report header
        const reportDate = formatDateTime(new Date());

        // PDF için özel font tanımlamaları
        doc.setFont("helvetica");
        
        // Add report title with encoding
        doc.setFontSize(20);
        doc.text('Internet Kesinti Raporu', 105, 20, { align: 'center' });
        
        // Add report date
        doc.setFontSize(12);
        doc.text(`Rapor Tarihi: ${reportDate}`, 105, 30, { align: 'center' });
        
        // Add statistics
        doc.setFontSize(14);
        doc.text('Ozet Bilgiler:', 20, 45);
        doc.setFontSize(12);
        doc.text(`Toplam Kesinti Sayisi: ${totalOutagesEl.textContent}`, 20, 55);
        doc.text(`Toplam Kesinti Suresi: ${totalOutageTimeEl.textContent}`, 20, 62);
        doc.text(`Ortalama Kesinti Suresi: ${avgOutageTimeEl.textContent}`, 20, 69);
        doc.text(`Ortalama Gecikme: ${avgLatencyEl.textContent}`, 20, 76);
        
        // Prepare table data
        const tableData = allOutages.map(outage => {
            const duration = (outage.end - outage.start) / (1000 * 60);
            return [
                formatDateTime(outage.start),
                formatDateTime(outage.end),
                formatMinutes(duration)
            ];
        });
        
        // Add table with encoding
        doc.autoTable({
            startY: 90,
            head: [['Baslangic Zamani', 'Bitis Zamani', 'Sure']],
            body: tableData,
            theme: 'grid',
            headStyles: { 
                fillColor: [52, 152, 219],
                font: 'helvetica',
                textColor: [255, 255, 255]
            },
            styles: { 
                font: 'helvetica',
                fontSize: 10
            },
            margin: { top: 90 }
        });
        
        // Save PDF
        doc.save(`internet-kesinti-raporu-${formatDateForFilename(new Date())}.pdf`);
    };

    window.exportToCSV = function() {
        const reportDate = formatDateTime(new Date());
        
        // CSV başlık satırı
        let csvContent = 'Başlangıç Zamanı,Bitiş Zamanı,Süre\n';
        
        // Tüm kesintileri CSV formatına dönüştür
        allOutages.forEach(outage => {
            const duration = (outage.end - outage.start) / (1000 * 60);
            csvContent += `${formatDateTime(outage.start)},${formatDateTime(outage.end)},${formatMinutes(duration)}\n`;
        });
        
        // CSV dosyasını indir
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `internet-kesinti-raporu-${formatDateForFilename(new Date())}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    window.exportToTXT = function() {
        // Create text content with UTF-8 BOM for proper Turkish character support
        const BOM = '\uFEFF';
        const reportDate = formatDateTime(new Date());
        let content = BOM + 'İNTERNET KESİNTİ RAPORU\n';
        content += '========================\n\n';
        content += `Rapor Tarihi: ${reportDate}\n\n`;
        
        content += 'ÖZET BİLGİLER\n';
        content += '-------------\n';
        content += `Toplam Kesinti Sayısı: ${totalOutagesEl.textContent}\n`;
        content += `Toplam Kesinti Süresi: ${totalOutageTimeEl.textContent}\n`;
        content += `Ortalama Kesinti Süresi: ${avgOutageTimeEl.textContent}\n`;
        content += `Ortalama Gecikme: ${avgLatencyEl.textContent}\n\n`;
        
        content += 'KESİNTİ DETAYLARI\n';
        content += '----------------\n';
        content += 'Başlangıç Zamanı        Bitiş Zamanı            Süre\n';
        content += '------------------------------------------------\n';
        
        allOutages.forEach(outage => {
            const duration = (outage.end - outage.start) / (1000 * 60);
            content += `${formatDateTime(outage.start).padEnd(22)} `;
            content += `${formatDateTime(outage.end).padEnd(22)} `;
            content += `${formatMinutes(duration)}\n`;
        });
        
        // Create and trigger download with UTF-8 encoding
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `internet-kesinti-raporu-${formatDateForFilename(new Date())}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    // Helper function for formatting date in filenames
    function formatDateForFilename(date) {
        return date.toISOString().split('T')[0];
    }
});