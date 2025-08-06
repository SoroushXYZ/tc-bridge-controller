#!/usr/bin/env python3
"""
Test script to verify TC Bridge Controller setup
"""

import sys
import subprocess
import importlib

def test_python_version():
    """Test Python version"""
    print("✓ Python version:", sys.version.split()[0])
    if sys.version_info < (3, 7):
        print("✗ Python 3.7+ required")
        return False
    return True

def test_dependencies():
    """Test required Python packages"""
    required_packages = [
        'flask',
        'flask_socketio', 
        'psutil',
        'netifaces',
        'eventlet'
    ]
    
    print("\nTesting Python dependencies:")
    all_good = True
    
    for package in required_packages:
        try:
            importlib.import_module(package)
            print(f"✓ {package}")
        except ImportError:
            print(f"✗ {package} - not installed")
            all_good = False
    
    return all_good

def test_system_commands():
    """Test required system commands"""
    required_commands = [
        'ip',
        'tc'
    ]
    
    print("\nTesting system commands:")
    all_good = True
    
    for command in required_commands:
        try:
            if command == 'tc':
                # tc doesn't support --version, use -help instead
                result = subprocess.run([command, '-help'], 
                                      capture_output=True, text=True)
            elif command == 'ip':
                # ip command doesn't support --version, use -V instead
                result = subprocess.run([command, '-V'], 
                                      capture_output=True, text=True)
            else:
                result = subprocess.run([command, '--version'], 
                                      capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✓ {command}")
            else:
                print(f"✗ {command} - not available")
                all_good = False
        except FileNotFoundError:
            print(f"✗ {command} - not found")
            all_good = False
    
    return all_good

def test_network_interfaces():
    """Test network interface detection"""
    print("\nTesting network interface detection:")
    
    try:
        import netifaces
        interfaces = netifaces.interfaces()
        print(f"✓ Found {len(interfaces)} network interfaces")
        
        # Show available interfaces
        print("Available interfaces:")
        for iface in interfaces:
            if iface not in ['lo', 'docker0', 'veth'] and not iface.startswith('br'):
                try:
                    addrs = netifaces.ifaddresses(iface)
                    if netifaces.AF_INET in addrs:
                        ip = addrs[netifaces.AF_INET][0]['addr']
                        print(f"  - {iface}: {ip}")
                except:
                    print(f"  - {iface}: (no IP)")
        
        return True
    except Exception as e:
        print(f"✗ Error detecting interfaces: {e}")
        return False

def test_permissions():
    """Test if running with sufficient permissions"""
    print("\nTesting permissions:")
    
    try:
        # Test if we can read network interface info
        with open('/sys/class/net/lo/operstate', 'r') as f:
            f.read()
        print("✓ Can read network interface information")
        
        # Test if we can run ip command
        result = subprocess.run(['ip', 'link', 'show'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ Can run ip commands")
        else:
            print("✗ Cannot run ip commands")
            return False
            
        return True
    except Exception as e:
        print(f"✗ Permission error: {e}")
        return False

def main():
    """Run all tests"""
    print("TC Bridge Controller - Setup Test")
    print("=" * 40)
    
    tests = [
        ("Python Version", test_python_version),
        ("Dependencies", test_dependencies),
        ("System Commands", test_system_commands),
        ("Network Interfaces", test_network_interfaces),
        ("Permissions", test_permissions)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"✗ {test_name} - Error: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 40)
    print("Test Results:")
    
    all_passed = True
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"{test_name}: {status}")
        if not result:
            all_passed = False
    
    print("\n" + "=" * 40)
    if all_passed:
        print("✓ All tests passed! You can run the application with:")
        print("  sudo python3 app.py")
        print("  or")
        print("  sudo ./start.sh")
    else:
        print("✗ Some tests failed. Please fix the issues above before running the application.")
        print("\nCommon fixes:")
        print("- Install missing packages: pip3 install -r requirements.txt")
        print("- Install iproute2: sudo apt-get install iproute2")
        print("- Run with sudo for network operations")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main()) 