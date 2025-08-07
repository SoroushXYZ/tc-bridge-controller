#!/usr/bin/env python3
"""
TC Bridge Controller - A Python-based UI for managing network bridges with traffic control
"""

import os
import subprocess
import json
import time
import threading
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import psutil
import netifaces
from config import *

app = Flask(__name__)
app.config['SECRET_KEY'] = 'tc-bridge-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

class NetworkBridge:
    def __init__(self):
        self.bridge_name = BRIDGE_NAME
        self.interfaces = []
        self.bridge_ip = BRIDGE_IP
        self.is_active = False
        
    def get_available_interfaces(self):
        """Get list of available network interfaces"""
        interfaces = []
        for interface in netifaces.interfaces():
            if interface not in EXCLUDED_INTERFACES and not interface.startswith('br'):
                try:
                    addrs = netifaces.ifaddresses(interface)
                    ip_addr = None
                    if netifaces.AF_INET in addrs:
                        ip_addr = addrs[netifaces.AF_INET][0]['addr']
                    
                    interfaces.append({
                        'name': interface,
                        'ip': ip_addr or 'No IP',
                        'status': 'up' if self._is_interface_up(interface) else 'down'
                    })
                except Exception as e:
                    # Still include interface even if we can't get IP
                    interfaces.append({
                        'name': interface,
                        'ip': 'Unknown',
                        'status': 'up' if self._is_interface_up(interface) else 'down'
                    })
        return interfaces
    
    def _is_interface_up(self, interface):
        """Check if interface is up"""
        try:
            with open(f'/sys/class/net/{interface}/operstate', 'r') as f:
                return f.read().strip() == 'up'
        except:
            return False
    
    def create_bridge(self, selected_interfaces):
        """Create network bridge with selected interfaces"""
        try:
            # Bring interfaces down
            for interface in selected_interfaces:
                subprocess.run(['ip', 'link', 'set', interface, 'down'], check=True)
            
            # Delete existing bridge if it exists
            subprocess.run(['ip', 'link', 'delete', self.bridge_name, 'type', 'bridge'], 
                         stderr=subprocess.DEVNULL)
            
            # Create bridge
            subprocess.run(['ip', 'link', 'add', 'name', self.bridge_name, 'type', 'bridge'], check=True)
            
            # Attach interfaces
            for interface in selected_interfaces:
                subprocess.run(['ip', 'link', 'set', interface, 'master', self.bridge_name], check=True)
            
            # Bring interfaces up
            for interface in selected_interfaces:
                subprocess.run(['ip', 'link', 'set', interface, 'up'], check=True)
            
            # Assign IP to bridge
            subprocess.run(['ip', 'addr', 'add', self.bridge_ip, 'dev', self.bridge_name], check=True)
            
            # Bring bridge up
            subprocess.run(['ip', 'link', 'set', self.bridge_name, 'up'], check=True)
            
            self.interfaces = selected_interfaces
            self.is_active = True
            return True, "Bridge created successfully"
            
        except subprocess.CalledProcessError as e:
            return False, f"Error creating bridge: {str(e)}"
    
    def destroy_bridge(self):
        """Destroy the network bridge"""
        try:
            # Bring bridge down
            subprocess.run(['ip', 'link', 'set', self.bridge_name, 'down'], 
                         stderr=subprocess.DEVNULL)
            
            # Delete bridge
            subprocess.run(['ip', 'link', 'delete', self.bridge_name, 'type', 'bridge'], 
                         stderr=subprocess.DEVNULL)
            
            self.interfaces = []
            self.is_active = False
            return True, "Bridge destroyed successfully"
            
        except subprocess.CalledProcessError as e:
            return False, f"Error destroying bridge: {str(e)}"
    
    def apply_tc_rules(self, rules):
        """Apply traffic control rules to selected interfaces"""
        try:
            # Get target interfaces
            target_interfaces = rules.get('interfaces', [])
            if not target_interfaces:
                return False, "No interfaces selected for TC rules"
            
            # Clear existing tc rules from target interfaces
            for interface in target_interfaces:
                subprocess.run(['tc', 'qdisc', 'del', 'dev', interface, 'root'], 
                             stderr=subprocess.DEVNULL)
            
            if not rules or len([k for k, v in rules.items() if k != 'interfaces' and v is not None and v != '']) == 0:
                return True, f"TC rules cleared from {len(target_interfaces)} interfaces"
            
            # Filter out None and empty values (excluding interfaces)
            filtered_rules = {k: v for k, v in rules.items() if k != 'interfaces' and v is not None and v != ''}
            
            if not filtered_rules:
                return True, "No valid TC rules to apply"
            
            # Apply TC rules to each selected interface
            for interface in target_interfaces:
                try:
                    # Check if we have bandwidth limiting
                    has_bandwidth = filtered_rules.get('bandwidth') and int(filtered_rules['bandwidth']) > 0
                    has_delay = filtered_rules.get('delay') and int(filtered_rules.get('delay', 0)) > 0
                    has_jitter = filtered_rules.get('jitter') and int(filtered_rules.get('jitter', 0)) > 0
                    has_loss = filtered_rules.get('packet_loss') and float(filtered_rules.get('packet_loss', 0)) > 0
                    
                    # If we only have delay/jitter/loss without bandwidth, use netem directly
                    if not has_bandwidth and (has_delay or has_jitter or has_loss):
                        cmd = ['tc', 'qdisc', 'add', 'dev', interface, 'root', 'handle', '1:', 'netem']
                        
                        if has_delay:
                            delay = int(filtered_rules['delay'])
                            cmd.extend(['delay', f'{delay}ms'])
                            if has_jitter:
                                jitter = int(filtered_rules['jitter'])
                                cmd.append(f'{jitter}ms')
                        
                        if has_loss:
                            loss = float(filtered_rules['packet_loss'])
                            cmd.extend(['loss', f'{loss}%'])
                        
                        subprocess.run(cmd, check=True)
                        
                    elif has_bandwidth:
                        # Use HTB for bandwidth limiting
                        subprocess.run(['tc', 'qdisc', 'add', 'dev', interface, 'root', 'handle', '1:', 'htb'], check=True)
                        
                        # Apply bandwidth limiting
                        bandwidth = int(filtered_rules['bandwidth'])
                        subprocess.run([
                            'tc', 'class', 'add', 'dev', interface, 'parent', '1:', 
                            'classid', '1:1', 'htb', 'rate', f'{bandwidth}mbit'
                        ], check=True)
                        
                        # Apply delay/jitter/loss to the HTB class
                        if has_delay or has_jitter or has_loss:
                            cmd = ['tc', 'qdisc', 'add', 'dev', interface, 'parent', '1:1',
                                   'handle', '10:', 'netem']
                            
                            if has_delay:
                                delay = int(filtered_rules['delay'])
                                cmd.extend(['delay', f'{delay}ms'])
                                if has_jitter:
                                    jitter = int(filtered_rules['jitter'])
                                    cmd.append(f'{jitter}ms')
                            
                            if has_loss:
                                loss = float(filtered_rules['packet_loss'])
                                cmd.extend(['loss', f'{loss}%'])
                            
                            subprocess.run(cmd, check=True)
                            
                except subprocess.CalledProcessError as e:
                    return False, f"Error applying TC rules to {interface}: {str(e)}"
            
            return True, f"TC rules applied successfully to {len(self.interfaces)} interfaces"
            
        except subprocess.CalledProcessError as e:
            return False, f"Error applying TC rules: {str(e)}"
        except (ValueError, TypeError) as e:
            return False, f"Invalid TC rule values: {str(e)}"
    
    def detect_existing_bridge(self):
        """Detect if bridge already exists and load its state"""
        try:
            # Check if bridge exists
            result = subprocess.run(['ip', 'link', 'show', self.bridge_name], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                # Bridge exists, get its interfaces
                brctl_result = subprocess.run(['brctl', 'show', self.bridge_name], 
                                            capture_output=True, text=True)
                if brctl_result.returncode == 0:
                    interfaces = []
                    lines = brctl_result.stdout.split('\n')
                    
                    # Find the line with our bridge name and parse interfaces
                    for i, line in enumerate(lines):
                        if line.strip().startswith(self.bridge_name):
                            # Parse the bridge line itself for interfaces
                            parts = line.split('\t')
                            if len(parts) >= 4:
                                # Last part might contain interface names
                                last_part = parts[-1].strip()
                                if last_part and last_part != 'interfaces':
                                    interfaces.extend(last_part.split())
                            
                            # Look for additional interface names in subsequent indented lines
                            for j in range(i + 1, len(lines)):
                                next_line = lines[j].strip()
                                if next_line and not next_line.startswith('bridge name'):
                                    # Check if this line is indented (interface line)
                                    if lines[j].startswith('\t') or lines[j].startswith(' '):
                                        interface_name = next_line.split()[0]
                                        if interface_name and interface_name != 'interfaces':
                                            interfaces.append(interface_name)
                                    else:
                                        # No more indented lines, stop parsing
                                        break
                            break
                    
                    self.interfaces = interfaces
                    self.is_active = True
                    return True
            return False
        except Exception as e:
            print(f"Error detecting existing bridge: {e}")
            return False

    def get_bridge_status(self):
        """Get current bridge status"""
        # First check if bridge exists but we haven't detected it yet
        if not self.is_active:
            self.detect_existing_bridge()
        
        if not self.is_active:
            return {
                'active': False,
                'interfaces': [],
                'ip': None,
                'status': 'down'
            }
        
        try:
            # Get bridge IP
            result = subprocess.run(['ip', 'addr', 'show', self.bridge_name], 
                                  capture_output=True, text=True)
            ip_match = None
            if result.stdout:
                for line in result.stdout.split('\n'):
                    if 'inet ' in line:
                        ip_match = line.strip().split()[1]
                        break
            
            return {
                'active': True,
                'interfaces': self.interfaces,
                'ip': ip_match,
                'status': 'up' if self._is_interface_up(self.bridge_name) else 'down'
            }
        except:
            return {
                'active': False,
                'interfaces': [],
                'ip': None,
                'status': 'error'
            }

    def get_tc_status(self, interface):
        """Get TC status for a specific interface"""
        try:
            result = subprocess.run(['tc', 'qdisc', 'show', 'dev', interface], 
                                  capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip():
                return True, result.stdout.strip()
            else:
                return False, "No TC rules"
        except:
            return False, "Error checking TC status"

# Global bridge instance
bridge = NetworkBridge()

# Detect existing bridge on startup
bridge.detect_existing_bridge()

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/interfaces')
def get_interfaces():
    """Get available network interfaces"""
    return jsonify(bridge.get_available_interfaces())

@app.route('/api/bridge/status')
def get_bridge_status():
    """Get bridge status"""
    return jsonify(bridge.get_bridge_status())

@app.route('/api/bridge/create', methods=['POST'])
def create_bridge():
    """Create network bridge"""
    data = request.get_json()
    interfaces = data.get('interfaces', [])
    
    if not interfaces:
        return jsonify({'success': False, 'message': 'No interfaces selected'})
    
    success, message = bridge.create_bridge(interfaces)
    return jsonify({'success': success, 'message': message})

@app.route('/api/bridge/destroy', methods=['POST'])
def destroy_bridge():
    """Destroy network bridge"""
    success, message = bridge.destroy_bridge()
    return jsonify({'success': success, 'message': message})

@app.route('/api/tc/apply', methods=['POST'])
def apply_tc_rules():
    """Apply traffic control rules"""
    data = request.get_json()
    rules = {
        'bandwidth': data.get('bandwidth'),
        'delay': data.get('delay'),
        'jitter': data.get('jitter'),
        'packet_loss': data.get('packet_loss'),
        'interfaces': data.get('interfaces', [])
    }
    
    success, message = bridge.apply_tc_rules(rules)
    return jsonify({'success': success, 'message': message})

@app.route('/api/tc/clear', methods=['POST'])
def clear_tc_rules():
    """Clear traffic control rules"""
    data = request.get_json() or {}
    interfaces = data.get('interfaces', [])
    
    # Create empty rules with interfaces to clear
    rules = {'interfaces': interfaces}
    success, message = bridge.apply_tc_rules(rules)
    return jsonify({'success': success, 'message': message})

@app.route('/api/tc/status/<interface>')
def get_tc_status(interface):
    """Get TC status for a specific interface"""
    has_tc, status = bridge.get_tc_status(interface)
    return jsonify({'has_tc': has_tc, 'status': status})

def background_monitor():
    """Background thread to monitor network status"""
    while True:
        if bridge.is_active:
            status = bridge.get_bridge_status()
            socketio.emit('bridge_status_update', status)
        time.sleep(2)

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('bridge_status_update', bridge.get_bridge_status())

if __name__ == '__main__':
    # Start background monitoring thread
    monitor_thread = threading.Thread(target=background_monitor, daemon=True)
    monitor_thread.start()
    
    print("TC Bridge Controller starting...")
    print(f"Access the UI at: http://localhost:{PORT}")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG) 