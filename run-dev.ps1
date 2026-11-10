# PowerShell script to start the development environment
Write-Host "Starting Excel Translator development environment..."

# Build and start the containers
docker compose up --build

Write-Host "Development environment is ready!"
