# ---- Builder Stage ----
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libpq-dev \
        libffi-dev \
        libmagic-dev \
        curl \
        wget \
        git \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency file first (for caching)
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip wheel setuptools && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy application code (this will invalidate cache when code changes)
COPY . .

# Verify the application code is copied correctly (for debugging)
RUN ls -la /app/app/ | head -20

# ---- Runtime Stage ----
FROM python:3.11-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application files
COPY --from=builder /app /app

# Expose the application port
EXPOSE 5000

# Healthcheck for container-level diagnostics
HEALTHCHECK CMD curl -f http://localhost:5000/health || exit 1

# Start FastAPI app using Gunicorn with Uvicorn workers
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "-b", "0.0.0.0:5000", "--timeout", "120"]