<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PDF-to-DOCX Structural Converter (Client-Server Architecture)

This repository contains a robust, containerized web application for converting PDF files into structured DOCX documents using a Python backend and a React frontend.

## Architecture Overview

This application uses a professional client-server architecture for improved security, performance, and reliability:

-   **Backend**: A Python server built with **FastAPI** that handles all heavy processing. It receives a PDF, converts its pages to images, and uses the Gemini API for OCR and content structuring.
-   **Frontend**: A **React** single-page application that provides the user interface. Its only jobs are to upload the file to the backend and display the structured results.
-   **Containerization**: The entire application (both frontend and backend) is packaged into a single **Docker** container, making it easy to run locally and deploy anywhere, including Google Cloud Run.

## Run Locally with Docker (Recommended)

**Prerequisites:** Docker Desktop

1.  **Create Environment File**:
    Create a file named `.env` in the root of the project.

2.  **Set Gemini API Key**:
    Add your Gemini API key to the `.env` file:
    ```
    GEMINI_API_KEY=your_api_key_here
    ```

3.  **Build and Run the Docker Container**:
    Open your terminal in the project root and run:
    ```sh
    docker build -t pdf-converter .
    docker run -p 8000:8000 --env-file .env pdf-converter
    ```

4.  **Open the App**:
    Navigate to [http://localhost:8000](http://localhost:8000) in your web browser.

## Deploy to Google Cloud Run

**Prerequisites**: `gcloud` CLI installed and configured.

### Step 1: Build and Push the Docker Image

Run the following command from your project directory to build your container image using Cloud Build and push it to Artifact Registry.
Replace `[PROJECT_ID]` with your Google Cloud Project ID and `[REGION]` with your preferred region (e.g., `us-central1`).

```sh
gcloud builds submit --tag [REGION]-docker.pkg.dev/[PROJECT_ID]/cloud-run-source-deploy/pdf-converter
```

### Step 2: Securely Store the API Key in Secret Manager

We will store the Gemini API key securely in Secret Manager instead of passing it as a plain environment variable.

1.  **Create the secret**:
    Replace `your_api_key_here` with your actual Gemini API key.
    ```sh
    echo -n "your_api_key_here" | gcloud secrets create gemini-api-key --data-file=-
    ```

2.  **Grant Cloud Run access to the secret**:
    The Cloud Run service needs permission to read the secret. Find your project number on the Google Cloud Console dashboard and replace `[PROJECT_NUMBER]` below.
    ```sh
    gcloud secrets add-iam-policy-binding gemini-api-key \
      --member="serviceAccount:[PROJECT_NUMBER]-compute@developer.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"
    ```

### Step 3: Deploy the Service to Cloud Run

This command deploys your container and securely mounts the secret you created as an environment variable that your Python code can access.

```sh
gcloud run deploy pdf-converter-service \
  --image [REGION]-docker.pkg.dev/[PROJECT_ID]/cloud-run-source-deploy/pdf-converter \
  --platform managed \
  --region [REGION] \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

### Step 4: Access Your Deployed App

Cloud Run will provide a URL for your deployed service. You can now use the application! To check the server logs, navigate to the "Logs" tab of your service in the Google Cloud Console.
