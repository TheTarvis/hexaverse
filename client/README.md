# Hexaverse
### Install Firebase
  1. Install firebase cli tools - choose any option below:
    a. `homebrew install firebase-cli` (macOS only) 
    b. `npm install -g firebase-tools`
    c. `curl -sL https://firebase.tools | bash`
  
  2. `firebase experiments:enable webframeworks`

### Getting Started
1. `cd /hexaverse`
2. `npm install`
3. Start the firebase emulator
   `firebase emulators:start`
4. Build the UI - In a new terminal:
    `npm run dev`
5. Build CloudFunctions - In another new terminal:
    `cd functions/`
    `npm run build:watch`
