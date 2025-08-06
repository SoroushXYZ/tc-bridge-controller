#!/bin/bash

# TC Bridge Controller Startup Script

echo "Starting TC Bridge Controller..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This application requires root privileges to manage network interfaces and tc rules."
    echo "Please run with sudo:"
    echo "sudo $0"
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if required packages are installed
echo "Checking dependencies..."
python3 -c "import flask, flask_socketio, psutil, netifaces" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing required Python packages..."
    pip3 install -r requirements.txt
fi

# Check if tc command is available
if ! command -v tc &> /dev/null; then
    echo "Warning: tc command not found. Traffic control features may not work."
    echo "Install iproute2 package: sudo apt-get install iproute2"
fi

# Start the application
echo "Starting web interface..."
echo "Access the UI at: http://localhost:5000"
echo "Press Ctrl+C to stop the application"
echo ""

python3 app.py 