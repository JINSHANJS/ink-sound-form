FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MPLBACKEND=Agg \
    TF_CPP_MIN_LOG_LEVEL=2 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=1 \
    TF_NUM_INTRAOP_THREADS=2 TF_NUM_INTEROP_THREADS=2 PORT=7860
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libgomp1 libcairo2 tesseract-ocr tesseract-ocr-chi-tra tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY web ./web
COPY vendor ./vendor
COPY fetch-weights.sh .
RUN sh fetch-weights.sh /app/weights && useradd --create-home --uid 1000 inkform
USER inkform
EXPOSE 7860
CMD ["python", "backend/serve.py"]
