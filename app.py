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
        """Apply traffic control rules to the bridge"""
        try:
            # Clear existing tc rules
            subprocess.run(['tc', 'qdisc', 'del', 'dev', self.bridge_name, 'root'], 
                         stderr=subprocess.DEVNULL)
            
            if not rules or not self.is_active:
                return True, "TC rules cleared"
            
            # Create root qdisc
            subprocess.run(['tc', 'qdisc', 'add', 'dev', self.bridge_name, 'root', 'handle', '1:', 'htb'], check=True)
            
            # Apply bandwidth limiting
            if rules.get('bandwidth'):
                bandwidth = rules['bandwidth']
                subprocess.run([
                    'tc', 'class', 'add', 'dev', self.bridge_name, 'parent', '1:', 
                    'classid', '1:1', 'htb', 'rate', f'{bandwidth}mbit'
                ], check=True)
            
            # Apply delay and jitter
            if rules.get('delay') or rules.get('jitter'):
                delay = rules.get('delay', 0)
                jitter = rules.get('jitter', 0)
                
                # Create netem qdisc for delay/jitter
                subprocess.run([
                    'tc', 'qdisc', 'add', 'dev', self.bridge_name, 'parent', '1:1',
                    'handle', '10:', 'netem', 'delay', f'{delay}ms', f'{jitter}ms'
                ], check=True)
            
            # Apply packet loss
            if rules.get('packet_loss'):
                loss = rules['packet_loss']
                subprocess.run([
                    'tc', 'qdisc', 'add', 'dev', self.bridge_name, 'parent', '1:1',
                    'handle', '20:', 'netem', 'loss', f'{loss}%'
                ], check=True)
            
            return True, "TC rules applied successfully"
            
        except subprocess.CalledProcessError as e:
            return False, f"Error applying TC rules: {str(e)}"
    
    def get_bridge_status(self):
        """Get current bridge status"""
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

# Global bridge instance
bridge = NetworkBridge()

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
        'packet_loss': data.get('packet_loss')
    }
    
    success, message = bridge.apply_tc_rules(rules)
    return jsonify({'success': success, 'message': message})

@app.route('/api/tc/clear', methods=['POST'])
def clear_tc_rules():
    """Clear traffic control rules"""
    success, message = bridge.apply_tc_rules({})
    return jsonify({'success': success, 'message': message})

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