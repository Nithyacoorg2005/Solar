# SolarGuard – AI-Based Solar Panel Fault Detection System

SolarGuard is an AI-based solar panel monitoring and fault detection system designed to automatically inspect solar panels using a phone camera connected to the computer through DroidCam.

The system captures solar panel images, sends them to an AI inference service, detects possible faults, stores inspection results, and presents the results through a web dashboard.

The system also supports scheduled automatic inspections, where the camera starts capturing images automatically at the configured inspection time.

---

## 1. Project Overview

Solar panels are continuously exposed to environmental conditions such as dust, weather, physical damage, and other factors that can affect their performance.

Manually inspecting large or elevated solar panels can be difficult and time-consuming.

SolarGuard aims to provide an automated visual inspection system.



---

# 2. Main Objectives

The project currently aims to provide:

- Live solar panel camera monitoring
- Phone camera integration
- Automatic image capture
- Scheduled inspections
- AI-based fault detection
- Confidence score for predictions
- Inspection history
- Dashboard statistics
- Weather information
- GPS information
- Cleaning recommendation
- Grad-CAM explainability
- Fault notifications
- Image upload as an alternative to camera capture
- User authentication
- Model-service integration


---

# 3. Technology Stack

## Frontend

### React

React is used to build the web interface.

The application is divided into reusable components such as:

- Dashboard
- CameraCapture
- InspectionHistory
- InspectionDetails
- ScheduleSettings
- NotificationStatus
- AuthPage

React manages:

- UI state
- Camera state
- Schedule state
- Inspection results
- Navigation
- User interactions


### TypeScript

TypeScript is used instead of plain JavaScript.

It provides:

- Type safety
- Better error detection
- Interfaces for inspection data
- Safer component properties
- Easier maintenance


### Tailwind CSS

Tailwind CSS is used for the user interface styling.

It provides utility classes for:

- Layout
- Spacing
- Colors
- Buttons
- Cards
- Responsive design
- Animations


### Lucide React

Lucide React provides the icons used throughout the application.

Examples include:

- Camera
- Dashboard
- History
- Settings
- Sun
- Upload
- Alert
- Check
- Notification icons


---

# 4. Camera System

## DroidCam

DroidCam is currently being used to connect the phone camera to the computer.

The architecture is:

Phone
↓
DroidCam Android App
↓
DroidCam Client
↓
Windows
↓
Browser Camera API
↓
SolarGuard


This allows the phone to act as the camera without requiring a physical USB camera mounted directly to the computer.

This is especially useful for the project because the solar panel may be located at a higher altitude.


---

# 5. Browser Camera API

The React application uses:

```javascript
navigator.mediaDevices.getUserMedia()