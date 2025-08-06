# TC Bridge Controller Configuration

# Bridge Configuration
BRIDGE_NAME = "br0"
BRIDGE_IP = "192.168.1.10/24"

# Web Server Configuration
HOST = "0.0.0.0"
PORT = 5000
DEBUG = True

# Traffic Control Defaults
DEFAULT_BANDWIDTH = 100  # Mbps
DEFAULT_DELAY = 50       # ms
DEFAULT_JITTER = 10      # ms
DEFAULT_PACKET_LOSS = 1  # %

# Network Interface Filters
# Interfaces to exclude from the interface list
EXCLUDED_INTERFACES = ['lo', 'docker0', 'veth']

# Logging Configuration
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# UI Configuration
AUTO_REFRESH_INTERVAL = 2000  # milliseconds
MAX_LOG_ENTRIES = 1000 