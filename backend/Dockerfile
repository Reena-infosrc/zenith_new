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

# Copy dependency file first (layer 2: invalidates only on requirements.txt change)
COPY requirements.txt .

# Create virtual environment and install Python dependencies (layer 3: pip packages cached)
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip wheel setuptools && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy application code (layer 4: changes frequently, cache invalidated only for this layer)
COPY . .

# Verify the application code is copied correctly (for debugging)
RUN ls -la /app/app/ | head -20

# Verify critical dependencies are installed
RUN /opt/venv/bin/python -c "from jose import jwt as jose_jwt; print('✅ jose installed')" || echo "❌ jose not installed"

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

# Fargate task: 512 CPU / 1024 MB.  4 workers × ~250 MB each = OOM.
# 2 workers fit safely; --timeout matches ALB idle_timeout (120s).
CMD ["gunicorn", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "-b", "0.0.0.0:5000", "--timeout", "120"]