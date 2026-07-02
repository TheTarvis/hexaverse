# Deploying to Google Cloud Run

This guide provides instructions for deploying the WebSocket server to Google Cloud Run using Google Cloud Build for CI/CD.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Google Cloud SDK installed locally
3. A GCP project with billing enabled
4. Required APIs enabled:
   - Cloud Build API
   - Cloud Run API
   - Container Registry API
   - Pub/Sub API

## Important Notes on WebSockets in Cloud Run

Cloud Run supports WebSockets with the following requirements:
- Session affinity must be enabled (we've configured this in cloudbuild.yaml)
- HTTP/2 must be used (we've configured this in cloudbuild.yaml)
- At least one minimum instance should be specified to avoid cold starts disrupting WebSocket connections

These settings are already configured in the `cloudbuild.yaml` file.

## Setup Steps

### 1. Initialize your project

```bash
# Set your project ID
PROJECT_ID=your-project-id
gcloud config set project $PROJECT_ID
```

### 2. Enable required APIs

```bash
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com pubsub.googleapis.com
```

### 3. Create a Pub/Sub topic

```bash
gcloud pubsub topics create colony-events  || drawing-events
```

### 4. Set up permissions

#### Create a service account for the WebSocket server

```bash
# Create the service account
gcloud iam service-accounts create websocket-server \
    --display-name="WebSocket Server Service Account"

# Grant Pub/Sub subscriber permission
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:websocket-server@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/pubsub.subscriber"

# Grant Pub/Sub publisher permission (for test endpoint)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:websocket-server@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/pubsub.publisher"
```

#### Set up Cloud Build permissions

The Cloud Build service account needs permissions to deploy to Cloud Run:

```bash
# Get your Cloud Build service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SERVICE_ACCOUNT="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
    $PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/iam.serviceAccountUser"
```

### 5. Configure continuous deployment

#### Option 1: Connect to GitHub (recommended)

1. Go to the Cloud Build page in the Google Cloud Console
2. Click "Triggers"
3. Click "Connect repository"
4. Connect to your GitHub repository
5. Create a build trigger:
   - Name: `websocket-server-deploy`
   - Event: `Push to a branch`
   - Source: Your repository and branch (e.g., `main`)
   - Configuration: `Cloud Build configuration file (yaml or json)`
   - Location: `Repository`
   - Cloud Build configuration file location: `cloudbuild.yaml`

#### Option 2: Manual build and deploy

```bash
# From your project directory
gcloud builds submit --config cloudbuild.yaml .
```

## Accessing your deployed application

After deployment, get the URL of your service:

```bash
gcloud run services describe websocket-server --format="value(status.url)"
```

The WebSocket endpoint will be available at `wss://YOUR-SERVICE-URL/ws`

## Setting up auto-publishing messages

To set up automatic message publishing to your WebSockets from other services:

1. Use the Pub/Sub topic `colony-events` to publish messages
2. Format your messages as JSON with the following structure:
```json
{
  "type": "message",
  "topic": "your-topic",
  "payload": {
    "your": "data"
  }
}
```

## Testing the deployment

You can test your WebSocket server using tools like [websocat](https://github.com/vi/websocat):

```bash
# Install websocat
# Connect to your WebSocket server
websocat wss://YOUR-SERVICE-URL/ws

# Subscribe to a topic
{"type":"subscribe","payload":"colony-events"}

# You should receive messages published to the topic
```

## Troubleshooting

- Check Cloud Build logs for build and deployment issues
- Check Cloud Run logs for runtime errors
- Ensure Pub/Sub IAM permissions are correctly set
- Verify that the WebSocket server can connect to Pub/Sub