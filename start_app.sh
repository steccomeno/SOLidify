#!/bin/bash
# Script to start the SOLidiFi app

echo "Starting SOLidiFi app..."
echo "Checking for dependencies..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js v16 or later."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies."
        exit 1
    fi
fi

# Kill any existing React processes
echo "Stopping any existing React processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Set environment variable to use mock data
echo "REACT_APP_USE_MOCK=true" > .env.local
echo "Environment set to use mock data"

# Start the app
echo "Starting the app with mock data..."
echo "If you want to use real Solana network, edit .env.local and set REACT_APP_USE_MOCK=false"
npm start

# Exit with the exit code of the last command
exit $? 