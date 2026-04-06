# Build: docker build -t asklytics-api -f backend/Dockerfile backend
# Run:  docker run --rm -p 8000:8000 -e JWT_SECRET_KEY=change-me -e CORS_ALLOW_ORIGINS=https://your-site.vercel.app asklytics-api
FROM python:3.12-slim-bookworm

WORKDIR /app
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV KMP_DUPLICATE_LIB_OK=TRUE

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# Cloud hosts often inject PORT; local `docker run -p 8000:8000` still works via default.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
