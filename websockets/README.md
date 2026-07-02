# Google Cloud Run WebSocket Server

A scalable WebSocket server using Go and Gorilla WebSocket, designed to run on Google Cloud Run with Firebase authentication and Pub/Sub integration.

## Features

- HTTP server that upgrades to WebSocket connections
- Connection manager to track clients and their topic subscriptions
- Broadcast/event router to push messages to subscribed clients
- Authentication via Firebase ID tokens
- Keep-alive/ping functionality to detect and clean up inactive connections
- Consumes events from a Google Cloud Pub/Sub topic
- Environment variable configuration with .env file support

## Requirements

- Go 1.19+
- Firebase Admin SDK credentials (for authentication)
- Google Cloud Pub/Sub topic (for consuming events)
- Google Cloud SDK (for deployment)

## Installing Google Cloud SDK

### macOS

Using Homebrew:
```bash
brew install --cask google-cloud-sdk
```

Or download the installer from [Google Cloud SDK website](https://cloud.google.com/sdk/docs/install-sdk).

### Linux
```bash
# Add the Cloud SDK distribution URI as a package source
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# Import the Google Cloud public key
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -

# Update the package list and install the Cloud SDK
sudo apt-get update && sudo apt-get install google-cloud-sdk
```

### Windows

Download and run the installer from [Google Cloud SDK website](https://cloud.google.com/sdk/docs/install-sdk).

## Google Cloud Authentication

There are two authentication methods you'll need depending on your context:

### For Local Development

When running the application locally that needs to access Google Cloud services (Pub/Sub, Firebase):

1. Set up application default credentials:
   ```bash
   gcloud auth application-default login
   ```
   This creates a local credential file that Google client libraries automatically use when making API calls.

2. Find and set the hexaverse project:
   ```bash
   # List available projects
   gcloud projects list
   
   # Look for hexaverse in the output (ID: 440067356194)
   
   # Set hexaverse as your project
   gcloud config set project hexaverse
   ```

3. Verify your configuration:
   ```bash
   gcloud config list
   ```

4. Enable required APIs for your project (if not already enabled):
   ```bash
   gcloud services enable pubsub.googleapis.com firebase.googleapis.com
   ```

### For Deployment

When deploying to Google Cloud Run:

1. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```

2. Set the hexaverse project:
   ```bash
   gcloud config set project hexaverse
   ```

3. Enable additional deployment-related APIs:
   ```bash
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com
   ```

## Local Development with Emulators

### Using the PubSub Emulator

The server can work with the Firebase/Google Cloud emulator suite for local development.

1. Start the emulators (The Firebase Emulator Suite includes a PubSub emulator)
   ```bash
   firebase emulators:start
   ```

2. Configure your `.env.local` file to use the emulator:
   ```
   # PubSub Emulator (local development)
   PUBSUB_EMULATOR_HOST=localhost:8085
   ```

3. When the emulator is detected, the server will:
   - Automatically create the topic if it doesn't exist
   - Provide a test endpoint at `/test/publish` for sending test messages

4. Test publishing messages to connected WebSocket clients:
   ```bash
   curl -X POST http://localhost:8081/test/publish \
     -H "Content-Type: application/json" \
     -d '{"type":"message","topic":"test-topic","payload":{"message":"Hello World!"}}'
   ```

## Configuration

The server uses environment variables for configuration, with support for loading from a .env file:

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | HTTP server port | 8080 |
| PUBSUB_PROJECT_ID | Google Cloud project ID for Pub/Sub (hexaverse) | "" |
| PUBSUB_TOPIC_ID | Pub/Sub topic ID | "" |
| FIREBASE_CRED_FILE | Path to Firebase credentials JSON file | "" |
| PUBSUB_EMULATOR_HOST | PubSub emulator host and port (e.g., localhost:8085) | "" |

### Using .env File

1. Create a `.env` file in the project root (use `.env.example` as a template)
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your configuration:
   ```
   # WebSocket Server Configuration
   PORT=8080
   
   # Google Cloud Settings
   PUBSUB_PROJECT_ID=hexaverse
   PUBSUB_TOPIC_ID=colony-events || drawing-events
   
   # Firebase Authentication
   FIREBASE_CRED_FILE=path/to/firebase-credentials.json
   
   # For local development with emulators
   PUBSUB_EMULATOR_HOST=localhost:8085
   ```

The application will automatically load these variables when it starts.

## Usage

### Running Locally

```bash
# Set up application default credentials if not already done
gcloud auth application-default login

# Ensure you're using the hexaverse project
gcloud config set project hexaverse

# Create and configure your .env file
cp .env.example .env
nano .env  # or use your preferred editor

# Run the server
go run main.go
```

### Building and Deploying to Google Cloud Run

```bash
# Build the container
gcloud builds submit --tag gcr.io/hexaverse/websocket-server

# Deploy to Cloud Run
gcloud run deploy websocket-server \
  --image gcr.io/hexaverse/websocket-server \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="PUBSUB_PROJECT_ID=hexaverse,PUBSUB_TOPIC_ID=[TOPIC_ID]"
```

## Client Protocol

### Connecting

Connect to the WebSocket endpoint with an authentication token:

```
ws://localhost:8081/ws?token=your-firebase-id-token
```

Or with Authorization header:

```
Authorization: Bearer your-firebase-id-token
```

### Client Messages

#### Subscribe to a Topic

```json
{
  "type": "subscribe",
  "payload": "topic-name"
}
```

#### Unsubscribe from a Topic

```json
{
  "type": "unsubscribe",
  "payload": "topic-name"
}
```

### Server Messages

#### Subscription Confirmation

```json
{
  "type": "subscribed",
  "topic": "topic-name"
}
```

#### Unsubscription Confirmation

```json
{
  "type": "unsubscribed",
  "topic": "topic-name"
}
```

#### Error Message

```json
{
  "type": "error",
  "error": "Error message"
}
```

#### Topic Message

```json
{
  "type": "message",
  "topic": "topic-name",
  "payload": {"json":  "data"}
}
```

## Health Check

A health check endpoint is available at `/health`. 