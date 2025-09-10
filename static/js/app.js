// TC Bridge Controller Frontend JavaScript

class BridgeController {
    constructor() {
        this.socket = io();
        this.selectedInterfaces = [];
        this.selectedTCTargets = [];
        this.currentBridgeStatus = null;
        this.selectedInterface = null;
        this.availableInterfaces = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInterfaces();
        this.loadBridgeStatus();
        this.loadNetworkStats();
        this.updateCurrentTime();
        this.setupSocketListeners();
        
        // Update time every second
        setInterval(() => this.updateCurrentTime(), 1000);
        
        // Update network stats every second
        setInterval(() => this.loadNetworkStats(), 1000);
    }

    setupEventListeners() {
        // Create bridge button
        document.getElementById('create-bridge-btn').addEventListener('click', () => {
            this.showInterfaceModal();
        });

        // Destroy bridge button
        document.getElementById('destroy-bridge-btn').addEventListener('click', () => {
            this.destroyBridge();
        });

        // Clear TC rules button
        document.getElementById('clear-tc-btn').addEventListener('click', () => {
            this.clearTCRules();
        });

        // TC form submission
        document.getElementById('tc-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.applyTCRules();
        });

        // Reset form button
        document.getElementById('reset-form').addEventListener('click', () => {
            this.resetTCForm();
        });

        // Clear log button
        document.getElementById('clear-log').addEventListener('click', () => {
            this.clearLog();
        });

        // Confirm bridge creation
        document.getElementById('confirm-bridge-creation').addEventListener('click', () => {
            this.createBridge();
        });

        // Interface selector for network stats
        document.getElementById('interface-selector').addEventListener('change', (e) => {
            this.selectedInterface = e.target.value;
            this.loadInterfaceStats();
        });
    }

    setupSocketListeners() {
        this.socket.on('bridge_status_update', (status) => {
            this.updateBridgeStatus(status);
        });
        
        this.socket.on('network_stats_update', (stats) => {
            this.updateNetworkStats(stats);
        });
    }

    async loadInterfaces() {
        try {
            const response = await fetch('/api/interfaces');
            const interfaces = await response.json();
            this.availableInterfaces = interfaces;
            this.renderInterfaceList(interfaces);
            this.updateInterfaceSelector(interfaces);
        } catch (error) {
            this.log('Error loading interfaces: ' + error.message, 'error');
        }
    }

    async refreshInterfaceSelector() {
        // Only refresh the interface selector dropdown, not the entire interface list
        try {
            const response = await fetch('/api/interfaces');
            const interfaces = await response.json();
            this.availableInterfaces = interfaces;
            this.updateInterfaceSelector(interfaces);
        } catch (error) {
            this.log('Error refreshing interface selector: ' + error.message, 'error');
        }
    }

    async loadBridgeStatus() {
        try {
            const response = await fetch('/api/bridge/status');
            const status = await response.json();
            this.updateBridgeStatus(status);
        } catch (error) {
            this.log('Error loading bridge status: ' + error.message, 'error');
        }
    }

    async loadNetworkStats() {
        try {
            const response = await fetch('/api/network/stats');
            const stats = await response.json();
            this.updateNetworkStats(stats);
        } catch (error) {
            this.log('Error loading network stats: ' + error.message, 'error');
        }
    }

    renderInterfaceList(interfaces) {
        const container = document.getElementById('interface-list');
        const modalContainer = document.getElementById('modal-interface-list');
        
        if (interfaces.length === 0) {
            container.innerHTML = '<div class="text-muted">No interfaces found</div>';
            modalContainer.innerHTML = '<div class="text-muted">No interfaces found</div>';
            return;
        }

        // Render for sidebar
        container.innerHTML = interfaces.map(iface => `
            <div class="interface-item">
                <div class="interface-info">
                    <div class="interface-name">${iface.name}</div>
                    <div class="interface-ip">${iface.ip}</div>
                </div>
                <span class="interface-status ${iface.status}">${iface.status}</span>
            </div>
        `).join('');

        // Render for modal
        modalContainer.innerHTML = interfaces.map(iface => `
            <div class="interface-item">
                <input type="checkbox" class="interface-checkbox" value="${iface.name}" id="modal-${iface.name}">
                <div class="interface-info">
                    <div class="interface-name">${iface.name}</div>
                    <div class="interface-ip">${iface.ip}</div>
                </div>
                <span class="interface-status ${iface.status}">${iface.status}</span>
            </div>
        `).join('');

        // Add event listeners to checkboxes
        document.querySelectorAll('.interface-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedInterfaces.push(e.target.value);
                } else {
                    this.selectedInterfaces = this.selectedInterfaces.filter(i => i !== e.target.value);
                }
            });
        });

        // Update interface tabs for TC selection
        this.updateInterfaceTabs(interfaces);
    }

    updateInterfaceTabs(interfaces = null) {
        const tabsContainer = document.getElementById('interface-tabs');
        
        if (!interfaces) {
            // Get interfaces from the sidebar list
            const interfaceItems = document.querySelectorAll('#interface-list .interface-item');
            interfaces = Array.from(interfaceItems).map(item => {
                const name = item.querySelector('.interface-name').textContent;
                const ip = item.querySelector('.interface-ip').textContent;
                const status = item.querySelector('.interface-status').textContent;
                return { name, ip, status };
            });
        }

        if (interfaces.length === 0) {
            tabsContainer.innerHTML = '<div class="text-muted">No interfaces available</div>';
            return;
        }

        // Create interface tabs
        tabsContainer.innerHTML = interfaces.map(iface => `
            <button type="button" class="btn interface-tab" data-interface="${iface.name}">
                <i class="fas fa-ethernet"></i> ${iface.name}
                <small class="d-block">${iface.ip}</small>
            </button>
        `).join('');

        // Add event listeners to tabs and restore selection state
        document.querySelectorAll('.interface-tab').forEach(tab => {
            const interfaceName = tab.dataset.interface;
            
            // Restore selection state if this interface was previously selected
            if (this.selectedTCTargets.includes(interfaceName)) {
                tab.classList.add('selected');
            }
            
            tab.addEventListener('click', (e) => {
                const interfaceName = e.currentTarget.dataset.interface;
                
                if (e.currentTarget.classList.contains('selected')) {
                    // Deselect
                    e.currentTarget.classList.remove('selected');
                    this.selectedTCTargets = this.selectedTCTargets.filter(i => i !== interfaceName);
                } else {
                    // Select
                    e.currentTarget.classList.add('selected');
                    this.selectedTCTargets.push(interfaceName);
                }
                
                this.log(`TC target interfaces: ${this.selectedTCTargets.join(', ')}`, 'info');
            });
        });
    }

    showInterfaceModal() {
        const modal = new bootstrap.Modal(document.getElementById('interface-modal'));
        modal.show();
    }

    async createBridge() {
        if (this.selectedInterfaces.length === 0) {
            this.showAlert('Please select at least one interface', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/bridge/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    interfaces: this.selectedInterfaces
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.log('Bridge created successfully', 'success');
                this.showAlert('Bridge created successfully', 'success');
                this.selectedInterfaces = [];
                this.loadBridgeStatus();
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('interface-modal'));
                modal.hide();
            } else {
                this.log('Failed to create bridge: ' + result.message, 'error');
                this.showAlert('Failed to create bridge: ' + result.message, 'danger');
            }
        } catch (error) {
            this.log('Error creating bridge: ' + error.message, 'error');
            this.showAlert('Error creating bridge: ' + error.message, 'danger');
        }
    }

    async destroyBridge() {
        if (!confirm('Are you sure you want to destroy the bridge?')) {
            return;
        }

        try {
            const response = await fetch('/api/bridge/destroy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.log('Bridge destroyed successfully', 'success');
                this.showAlert('Bridge destroyed successfully', 'success');
                this.loadBridgeStatus();
                
                // Clear interface selections
                this.selectedInterfaces = [];
                this.clearInterfaceModalSelections();
            } else {
                this.log('Failed to destroy bridge: ' + result.message, 'error');
                this.showAlert('Failed to destroy bridge: ' + result.message, 'danger');
            }
        } catch (error) {
            this.log('Error destroying bridge: ' + error.message, 'error');
            this.showAlert('Error destroying bridge: ' + error.message, 'danger');
        }
    }

    async applyTCRules() {
        const formData = {
            bandwidth: document.getElementById('bandwidth').value || null,
            delay: document.getElementById('delay').value || null,
            jitter: document.getElementById('jitter').value || null,
            packet_loss: document.getElementById('packet-loss').value || null,
            interfaces: this.selectedTCTargets
        };

        // Validate that at least one rule is set
        const hasRules = Object.values(formData).some(value => value !== null && value !== '');
        if (!hasRules) {
            this.showAlert('Please set at least one traffic control rule', 'warning');
            return;
        }

        // Validate that at least one interface is selected
        if (this.selectedTCTargets.length === 0) {
            this.showAlert('Please select at least one interface to apply TC rules to', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/tc/apply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.log(`TC rules applied successfully to ${this.selectedTCTargets.join(', ')}`, 'success');
                this.showAlert('TC rules applied successfully', 'success');
                this.updateInterfaceTabs();
            } else {
                this.log('Failed to apply TC rules: ' + result.message, 'error');
                this.showAlert('Failed to apply TC rules: ' + result.message, 'danger');
            }
        } catch (error) {
            this.log('Error applying TC rules: ' + error.message, 'error');
            this.showAlert('Error applying TC rules: ' + error.message, 'danger');
        }
    }

    async clearTCRules() {
        if (!confirm('Are you sure you want to clear all TC rules?')) {
            return;
        }

        // If no interfaces are selected, clear from all available interfaces
        let interfacesToClear = this.selectedTCTargets;
        if (interfacesToClear.length === 0) {
            // Get all available interfaces from the sidebar
            const interfaceItems = document.querySelectorAll('#interface-list .interface-item');
            interfacesToClear = Array.from(interfaceItems).map(item => 
                item.querySelector('.interface-name').textContent
            );
        }

        try {
            const response = await fetch('/api/tc/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    interfaces: interfacesToClear
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.log(`TC rules cleared successfully from ${interfacesToClear.join(', ')}`, 'success');
                this.showAlert('TC rules cleared successfully', 'success');
                // Clear the selection after successful clear
                this.selectedTCTargets = [];
                this.updateInterfaceTabs();
            } else {
                this.log('Failed to clear TC rules: ' + result.message, 'error');
                this.showAlert('Failed to clear TC rules: ' + result.message, 'danger');
            }
        } catch (error) {
            this.log('Error clearing TC rules: ' + error.message, 'error');
            this.showAlert('Error clearing TC rules: ' + error.message, 'danger');
        }
    }

    resetTCForm() {
        document.getElementById('bandwidth').value = '';
        document.getElementById('delay').value = '';
        document.getElementById('jitter').value = '';
        document.getElementById('packet-loss').value = '';
        this.log('TC form cleared', 'info');
    }

    updateBridgeStatus(status) {
        // Check if status actually changed before updating
        const statusChanged = this.currentBridgeStatus && 
            this.currentBridgeStatus.active !== status.active;
        
        this.currentBridgeStatus = status;
        const statusElement = document.getElementById('bridge-status');
        const detailsElement = document.getElementById('bridge-details');
        const statusIndicator = statusElement.querySelector('.status-indicator');
        const statusText = statusElement.querySelector('.status-text');

        if (status.active) {
            statusIndicator.className = 'status-indicator active';
            statusText.textContent = 'Active';
            detailsElement.style.display = 'block';
            
            document.getElementById('bridge-ip').textContent = status.ip || 'N/A';
            document.getElementById('bridge-interfaces').textContent = status.interfaces.join(', ') || 'N/A';
        } else {
            statusIndicator.className = 'status-indicator inactive';
            statusText.textContent = 'Inactive';
            detailsElement.style.display = 'none';
        }

        // Only update interface selector if bridge status actually changed
        if (statusChanged) {
            this.updateInterfaceSelector(this.availableInterfaces);
        }
    }

    log(message, type = 'info') {
        const logContainer = document.getElementById('log-output');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const time = new Date().toLocaleTimeString();
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-message">${message}</span>
        `;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    showAlert(message, type) {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        // Create new alert
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Insert at the top of the main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(alertDiv, mainContent.firstChild);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    clearLog() {
        document.getElementById('log-output').innerHTML = '';
        this.log('Log cleared', 'info');
    }

    updateCurrentTime() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = new Date().toLocaleTimeString();
        }
    }

    updateInterfaceSelector(interfaces) {
        const selector = document.getElementById('interface-selector');
        const currentSelection = selector.value; // Preserve current selection
        
        selector.innerHTML = '<option value="">Select interface...</option>';
        
        // Add bridge interfaces if bridge is active
        if (this.currentBridgeStatus && this.currentBridgeStatus.active) {
            this.currentBridgeStatus.interfaces.forEach(iface => {
                const option = document.createElement('option');
                option.value = iface;
                option.textContent = `${iface} (Bridge)`;
                selector.appendChild(option);
            });
        }
        
        // Add all available interfaces
        interfaces.forEach(iface => {
            if (!this.currentBridgeStatus || !this.currentBridgeStatus.interfaces.includes(iface.name)) {
                const option = document.createElement('option');
                option.value = iface.name;
                option.textContent = `${iface.name} (${iface.ip})`;
                selector.appendChild(option);
            }
        });
        
        // Restore selection if it still exists
        if (currentSelection && selector.querySelector(`option[value="${currentSelection}"]`)) {
            selector.value = currentSelection;
        }
    }

    async loadInterfaceStats() {
        if (!this.selectedInterface) {
            this.hideInterfaceStats();
            return;
        }

        try {
            const response = await fetch(`/api/network/stats/${this.selectedInterface}`);
            if (response.ok) {
                const stats = await response.json();
                this.updateInterfaceStats(stats);
            } else {
                this.log(`Error loading stats for ${this.selectedInterface}: Interface not found`, 'error');
                this.hideInterfaceStats();
            }
        } catch (error) {
            this.log(`Error loading interface stats: ${error.message}`, 'error');
            this.hideInterfaceStats();
        }
    }

    updateInterfaceStats(stats) {
        // Show interface status
        const statusDiv = document.getElementById('interface-status');
        const statusText = document.getElementById('interface-status-text');
        statusDiv.style.display = 'block';
        
        const statusClass = stats.status === 'up' ? 'alert-success' : 'alert-danger';
        const statusIcon = stats.status === 'up' ? 'fa-check-circle' : 'fa-times-circle';
        statusDiv.innerHTML = `
            <div class="col-12">
                <div class="alert ${statusClass} d-flex align-items-center">
                    <i class="fas ${statusIcon} me-2"></i>
                    <span>Interface <strong>${stats.interface}</strong> is <strong>${stats.status}</strong></span>
                </div>
            </div>
        `;

        // Update statistics with rates and totals
        const rates = stats.rates || {};
        const raw = stats.raw_stats || {};

        // Incoming rate and total
        const rxRate = rates.rx_bytes_per_sec || 0;
        const rxTotal = raw.rx_bytes || 0;
        document.getElementById('rx-bytes').textContent = this.formatBytesPerSecond(rxRate);
        document.getElementById('rx-total').textContent = `Total: ${this.formatBytes(rxTotal)}`;

        // Outgoing rate and total
        const txRate = rates.tx_bytes_per_sec || 0;
        const txTotal = raw.tx_bytes || 0;
        document.getElementById('tx-bytes').textContent = this.formatBytesPerSecond(txRate);
        document.getElementById('tx-total').textContent = `Total: ${this.formatBytes(txTotal)}`;

        // Incoming packet rate and total
        const rxPacketRate = rates.rx_packets_per_sec || 0;
        const rxPacketTotal = raw.rx_packets || 0;
        document.getElementById('rx-packets').textContent = this.formatPacketsPerSecond(rxPacketRate);
        document.getElementById('rx-packets-total').textContent = `Total: ${this.formatNumber(rxPacketTotal)}`;

        // Outgoing packet rate and total
        const txPacketRate = rates.tx_packets_per_sec || 0;
        const txPacketTotal = raw.tx_packets || 0;
        document.getElementById('tx-packets').textContent = this.formatPacketsPerSecond(txPacketRate);
        document.getElementById('tx-packets-total').textContent = `Total: ${this.formatNumber(txPacketTotal)}`;

        // Total data rate and total
        const totalDataRate = rxRate + txRate;
        const totalDataTotal = rxTotal + txTotal;
        document.getElementById('total-bytes').textContent = this.formatBytesPerSecond(totalDataRate);
        document.getElementById('total-bytes-total').textContent = `Total: ${this.formatBytes(totalDataTotal)}`;

        // Total packet rate and total
        const totalPacketRate = rxPacketRate + txPacketRate;
        const totalPacketTotal = rxPacketTotal + txPacketTotal;
        document.getElementById('total-packets').textContent = this.formatPacketsPerSecond(totalPacketRate);
        document.getElementById('total-packets-total').textContent = `Total: ${this.formatNumber(totalPacketTotal)}`;

        // Error rate and total
        const errorRate = stats.error_rate || 0;
        const errorTotal = (raw.rx_errors || 0) + (raw.tx_errors || 0);
        document.getElementById('error-rate').textContent = `${errorRate.toFixed(2)}%`;
        document.getElementById('error-total').textContent = `Total: ${this.formatNumber(errorTotal)} errors`;

    }

    hideInterfaceStats() {
        document.getElementById('interface-status').style.display = 'none';
        
        // Reset all stats to default
        document.getElementById('rx-bytes').textContent = '0 B/s';
        document.getElementById('tx-bytes').textContent = '0 B/s';
        document.getElementById('error-rate').textContent = '0%';
        
        // Reset packet stats
        document.getElementById('rx-packets').textContent = '0 pps';
        document.getElementById('tx-packets').textContent = '0 pps';
        document.getElementById('total-packets').textContent = '0 pps';
        
        // Reset total data stats
        document.getElementById('total-bytes').textContent = '0 B/s';
        document.getElementById('total-bytes-total').textContent = 'Total: 0 B';
        
        // Reset totals
        document.getElementById('rx-total').textContent = 'Total: 0 B';
        document.getElementById('tx-total').textContent = 'Total: 0 B';
        document.getElementById('rx-packets-total').textContent = 'Total: 0';
        document.getElementById('tx-packets-total').textContent = 'Total: 0';
        document.getElementById('total-packets-total').textContent = 'Total: 0';
        document.getElementById('error-total').textContent = 'Total: 0 errors';
    }

    updateNetworkStats(stats) {
        // Only update interface selector if bridge status actually changed
        const bridgeActive = stats.bridge && Object.keys(stats.bridge).length > 0;
        const statusChanged = this.currentBridgeStatus && 
            this.currentBridgeStatus.active !== bridgeActive;
        
        if (statusChanged) {
            // Only refresh interface selector, not the entire interface list
            this.refreshInterfaceSelector();
        }
        
        // If an interface is selected, load its stats
        if (this.selectedInterface) {
            this.loadInterfaceStats();
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatNumber(num) {
        if (num === 0) return '0';
        if (num < 1000) return num.toString();
        if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
        if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
        return (num / 1000000000).toFixed(1) + 'B';
    }

    formatBytesPerSecond(bytesPerSec) {
        if (bytesPerSec === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
        const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
        return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatPacketsPerSecond(packetsPerSec) {
        if (packetsPerSec === 0) return '0 pps';
        if (packetsPerSec < 1000) return packetsPerSec.toFixed(1) + ' pps';
        if (packetsPerSec < 1000000) return (packetsPerSec / 1000).toFixed(1) + ' Kpps';
        return (packetsPerSec / 1000000).toFixed(1) + ' Mpps';
    }

    clearInterfaceModalSelections() {
        // Clear all checkboxes in the interface modal
        document.querySelectorAll('.interface-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Clear the selected interfaces array
        this.selectedInterfaces = [];
        
        this.log('Interface selections cleared', 'info');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BridgeController();
}); 