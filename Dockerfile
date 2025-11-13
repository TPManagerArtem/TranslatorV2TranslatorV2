# Stage 1: Build the React frontend
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependency files and install them to leverage Docker cache
COPY package.json package-lock.json ./
RUN npm install

# Copy only frontend-specific files to leverage cache
COPY App.tsx index.html index.css index.tsx tsconfig.json vite.config.ts types.ts ./
COPY components ./components
COPY hooks ./hooks
COPY services ./services

# Copy the rest of the frontend code and build it
RUN npm run build

# Stage 2: Create the final Python image
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Python backend code
COPY main.py .

# Copy the built frontend from the builder stage into a 'static' directory
COPY --from=builder /app/dist ./static

# Expose the port that Cloud Run will use (default is 8080)
EXPOSE 8080

# Command to run the Uvicorn server
# It will listen on all interfaces (0.0.0.0) on the port provided by Cloud Run ($PORT)
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
