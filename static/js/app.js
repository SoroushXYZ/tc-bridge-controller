// TC Bridge Controller Frontend JavaScript

class BridgeController {
    constructor() {
        this.socket = io();
        this.selectedInterfaces = [];
        this.currentBridgeStatus = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInterfaces();
        this.loadBridgeStatus();
        this.updateCurrentTime();
        this.setupSocketListeners();
        
        // Update time every second
        setInterval(() => this.updateCurrentTime(), 1000);
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
    }

    setupSocketListeners() {
        this.socket.on('bridge_status_update', (status) => {
            this.updateBridgeStatus(status);
        });
    }

    async loadInterfaces() {
        try {
            const response = await fetch('/api/interfaces');
            const interfaces = await response.json();
            this.renderInterfaceList(interfaces);
        } catch (error) {
            this.log('Error loading interfaces: ' + error.message, 'error');
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
            packet_loss: document.getElementById('packet-loss').value || null
        };

        // Validate that at least one rule is set
        const hasRules = Object.values(formData).some(value => value !== null);
        if (!hasRules) {
            this.showAlert('Please set at least one traffic control rule', 'warning');
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
                this.log('TC rules applied successfully', 'success');
                this.showAlert('TC rules applied successfully', 'success');
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

        try {
            const response = await fetch('/api/tc/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.log('TC rules cleared successfully', 'success');
                this.showAlert('TC rules cleared successfully', 'success');
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
        this.log('TC form reset', 'info');
    }

    updateBridgeStatus(status) {
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BridgeController();
}); 