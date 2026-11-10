#!/usr/bin/env python3
"""
Orchestrator for Excel Translator application
"""

import os
import sys
import subprocess

def main():
    print("Starting Excel Translator orchestrator...")
    
    # Check if docker-compose is available
    try:
        subprocess.run(["docker-compose", "--version"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: docker-compose is not installed or not in PATH")
        sys.exit(1)
    
    # Start the services
    try:
        result = subprocess.run(["docker-compose", "up", "--build"], check=True, capture_output=True, text=True)
        print("Services started successfully!")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error starting services: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()